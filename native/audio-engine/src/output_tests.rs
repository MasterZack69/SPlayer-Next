use std::sync::Arc;
use std::time::{Duration, Instant};

use ffmpeg_audio::HttpCancelHandle;
use parking_lot::Mutex;

use crate::decoder::{prepare_decode, start_prepared_decode};
use crate::equalizer::Equalizer;
use crate::shared::{PopResult, Shared};
use crate::tempo::StretchProcessor;

/// 用已知频率和时长验证重采样，避免仅检查元数据中的采样率。
fn tone_file(rate: u32, suffix: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!(
        "splayer-rate-{}-{rate}-{suffix}.wav",
        std::process::id()
    ));
    let size = rate * 4;
    let mut wav = Vec::with_capacity(44 + size as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + size).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16_u32.to_le_bytes());
    wav.extend_from_slice(&1_u16.to_le_bytes());
    wav.extend_from_slice(&2_u16.to_le_bytes());
    wav.extend_from_slice(&rate.to_le_bytes());
    wav.extend_from_slice(&(rate * 4).to_le_bytes());
    wav.extend_from_slice(&4_u16.to_le_bytes());
    wav.extend_from_slice(&16_u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&size.to_le_bytes());
    for frame in 0..rate {
        let phase = f64::from(frame) * 1000.0 * std::f64::consts::TAU / f64::from(rate);
        let sample = (phase.sin() * 8192.0).round() as i16;
        wav.extend_from_slice(&sample.to_le_bytes());
        wav.extend_from_slice(&sample.to_le_bytes());
    }
    std::fs::write(&path, wav).unwrap();
    path
}

#[test]
fn real_decoder_preserves_duration_and_pitch_across_output_rates() {
    for (input, output) in [
        (44_100, 48_000),
        (48_000, 44_100),
        (96_000, 96_000),
        (192_000, 48_000),
        (192_000, 192_000),
        (352_800, 48_000),
        (352_800, 352_800),
    ] {
        let path = tone_file(input, &output.to_string());
        let prepared =
            prepare_decode(path.to_str().unwrap(), None, HttpCancelHandle::new()).unwrap();
        let shared = Shared::new(output, 2);
        let (_, worker, _) = start_prepared_decode(
            prepared,
            Arc::clone(&shared),
            Arc::new(Mutex::new(Equalizer::new(output, 2))),
            Arc::new(Mutex::new(StretchProcessor::new(2, output))),
        )
        .unwrap();
        let mut samples = Vec::new();
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            assert!(Instant::now() < deadline, "解码超时: {input} -> {output}");
            match shared.try_pop() {
                PopResult::Chunk(chunk) => samples.extend(chunk.player_samples),
                PopResult::Pending => std::thread::sleep(Duration::from_millis(1)),
                PopResult::Finished => break,
            }
        }
        let mut decoder = worker.join().unwrap();
        std::fs::remove_file(path).unwrap();
        if input == 192_000 && output == 192_000 {
            assert!(decoder.seek(0.25));
            decoder.reconfigure_player_output(48_000, 2).unwrap();
            let resumed = Shared::new(48_000, 2);
            let worker = crate::decoder::resume_decode(
                decoder,
                Arc::clone(&resumed),
                Arc::new(Mutex::new(Equalizer::new(48_000, 2))),
                Arc::new(Mutex::new(StretchProcessor::new(2, 48_000))),
            )
            .unwrap();
            let mut count = 0;
            let deadline = Instant::now() + Duration::from_secs(10);
            loop {
                assert!(Instant::now() < deadline, "seek 后输出未完成");
                match resumed.try_pop() {
                    PopResult::Chunk(chunk) => count += chunk.player_samples.len(),
                    PopResult::Pending => std::thread::sleep(Duration::from_millis(1)),
                    PopResult::Finished => break,
                }
            }
            worker.join().unwrap();
            assert!(!resumed.is_decode_failed());
            assert!(
                (count as i64 - 72_000).abs() <= 4,
                "seek/切设备后时长错误: {count}"
            );
        }
        assert!(!shared.is_decode_failed());
        assert!(
            (samples.len() as i64 - i64::from(output) * 2).abs() <= 4,
            "时长错误: {input} -> {output}"
        );
        assert!(samples.iter().all(|s| s.is_finite() && s.abs() <= 0.3));
        let crossings = samples
            .chunks_exact(2)
            .map(|frame| frame[0])
            .collect::<Vec<_>>()
            .windows(2)
            .filter(|pair| pair[0] <= 0.0 && pair[1] > 0.0)
            .count();
        assert!(
            (crossings as i32 - 1000).abs() <= 2,
            "音调错误: {input} -> {output}: {crossings}"
        );
    }
}

#[cfg(target_os = "linux")]
#[test]
#[ignore = "需要 scripts/test-pipewire.sh 创建的隔离 PipeWire 服务"]
fn pipewire_real_output_rate_matrix() {
    use crate::audio_output::AudioOutput;
    use crate::fft::FftAnalyzer;
    use crate::playback::PlaybackHandle;
    use std::sync::atomic::{AtomicUsize, Ordering};

    assert_eq!(cpal::default_host().id(), cpal::HostId::PipeWire);
    let _ = tracing_subscriber::fmt().with_test_writer().try_init();
    for rate in [44_100, 48_000, 88_200, 96_000, 176_400, 192_000, 352_800] {
        let failures = Arc::new(AtomicUsize::new(0));
        let errors = Arc::clone(&failures);
        let output = AudioOutput::new(
            None,
            Some(rate),
            Some(16),
            1,
            Arc::new(move || {
                errors.fetch_add(1, Ordering::Relaxed);
            }),
            None,
        )
        .unwrap();
        let (output, shared, playback) =
            PlaybackHandle::prepare(output, Arc::new(FftAnalyzer::new())).unwrap();
        assert_eq!(output.sample_rate(), rate, "未使用测试要求的流采样率");
        let path = tone_file(rate, "pipewire");
        let prepared =
            prepare_decode(path.to_str().unwrap(), None, HttpCancelHandle::new()).unwrap();
        let (_, worker, _) = start_prepared_decode(
            prepared,
            Arc::clone(&shared),
            Arc::new(Mutex::new(Equalizer::new(rate, 2))),
            Arc::new(Mutex::new(StretchProcessor::new(2, rate))),
        )
        .unwrap();
        let start = Instant::now();
        playback.activate(1.0, false).unwrap();
        while !shared.is_all_consumed() && start.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(5));
        }
        playback.pause();
        shared.stop();
        worker.join().unwrap();
        std::fs::remove_file(path).unwrap();
        assert!(shared.is_all_consumed(), "输出停滞: {rate}");
        assert_eq!(failures.load(Ordering::Relaxed), 0, "输出重建: {rate}");
        assert!((shared.consumed_position() - 1.0).abs() < 0.001);
        assert!(
            (start.elapsed().as_secs_f64() - 1.0).abs() < 0.35,
            "播放速度错误: {rate}"
        );
        let underruns = shared.take_underruns();
        println!(
            "rate={rate} elapsed={:?} source_underruns={underruns}",
            start.elapsed()
        );
        assert_eq!(underruns, 0, "正常负载发生供数欠载: {rate}");
    }
}
