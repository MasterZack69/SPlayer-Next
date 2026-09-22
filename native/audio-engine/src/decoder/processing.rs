use super::*;
use crate::dsp::limiter::OutputLimiter;

fn process_audio_chunk(
    mut chunk: AudioChunk,
    equalizer: &Mutex<Equalizer>,
    tempo: &Mutex<StretchProcessor>,
    limiter: &mut OutputLimiter,
    tempo_scratch: &mut Vec<f32>,
    channels: u16,
) -> AudioChunk {
    if chunk.player_samples.is_empty() {
        return chunk;
    }

    equalizer
        .lock()
        .process_interleaved(&mut chunk.player_samples);
    if tempo.lock().is_bypass() {
        limiter.process(&mut chunk.player_samples, channels);
        return chunk;
    }

    tempo_scratch.clear();
    tempo.lock().process(&chunk.player_samples, tempo_scratch);
    limiter.process(tempo_scratch, channels);
    std::mem::swap(&mut chunk.player_samples, tempo_scratch);
    chunk
}

fn run_dsp_loop(shared: &Shared, equalizer: &Mutex<Equalizer>, tempo: &Mutex<StretchProcessor>) {
    let mut limiter = OutputLimiter::new();
    let mut tempo_scratch = shared.take_player_buffer();
    while let Some(chunk) = shared.pop_decoded() {
        let chunk = process_audio_chunk(
            chunk,
            equalizer,
            tempo,
            &mut limiter,
            &mut tempo_scratch,
            shared.channels(),
        );
        shared.push_output(chunk);
        if shared.is_stopping() {
            break;
        }
    }
    shared.recycle_player_buffer(tempo_scratch);
}

pub(super) fn run_dsp_safely(
    shared: Arc<Shared>,
    equalizer: Arc<Mutex<Equalizer>>,
    tempo: Arc<Mutex<StretchProcessor>>,
) {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run_dsp_loop(&shared, &equalizer, &tempo);
    }));
    if result.is_err() {
        shared.mark_decode_failed();
    }
    shared.mark_output_eof();
}

#[cfg(test)]
#[path = "tests/processing.rs"]
mod tests;
