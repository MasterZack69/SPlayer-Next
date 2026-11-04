use std::fmt;

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

#[napi(string_enum)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaEventType {
    Play,
    Pause,
    Stop,
    NextTrack,
    PrevTrack,
    SetShuffle,
    SetRepeat,
    SetRate,
    SetVolume,
    /// 绝对位置（毫秒）
    Seek,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct MediaEvent {
    pub type_: MediaEventType,
    pub position_ms: Option<f64>,
    pub rate: Option<f64>,
    pub volume: Option<f64>,
    pub shuffle: Option<bool>,
    pub repeat: Option<RepeatMode>,
}

impl MediaEvent {
    /// Create an event without an additional value.
    pub const fn new(t: MediaEventType) -> Self {
        Self {
            type_: t,
            position_ms: None,
            rate: None,
            volume: None,
            shuffle: None,
            repeat: None,
        }
    }
    /// Create an absolute seek request in milliseconds.
    pub const fn seek(pos: f64) -> Self {
        Self {
            position_ms: Some(pos),
            ..Self::new(MediaEventType::Seek)
        }
    }
    /// Create a playback-rate request.
    pub const fn set_rate(rate: f64) -> Self {
        Self {
            rate: Some(rate),
            ..Self::new(MediaEventType::SetRate)
        }
    }
    /// Create a volume request.
    pub const fn set_volume(volume: f64) -> Self {
        Self {
            volume: Some(volume),
            ..Self::new(MediaEventType::SetVolume)
        }
    }
    /// Create an explicit shuffle request.
    pub const fn set_shuffle(shuffle: bool) -> Self {
        Self {
            shuffle: Some(shuffle),
            ..Self::new(MediaEventType::SetShuffle)
        }
    }
    /// Create an explicit repeat request.
    pub const fn set_repeat(repeat: RepeatMode) -> Self {
        Self {
            repeat: Some(repeat),
            ..Self::new(MediaEventType::SetRepeat)
        }
    }
}

/// 内部使用的元数据（cover_data 已转为 Vec<u8>）
#[derive(Clone, PartialEq)]
pub struct MetadataPayload {
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub cover_data: Option<Vec<u8>>,
    pub cover_url: Option<String>,
    pub duration_ms: Option<f64>,
}

impl fmt::Debug for MetadataPayload {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MetadataPayload")
            .field("title", &self.title)
            .field("artists", &self.artists)
            .field("album", &self.album)
            .field(
                "cover_data",
                &self.cover_data.as_ref().map_or_else(
                    || "None".to_string(),
                    |bytes| format!("Some({} bytes)", bytes.len()),
                ),
            )
            .field("cover_url", &self.cover_url)
            .field("duration_ms", &self.duration_ms)
            .finish()
    }
}

/// NAPI 层接收的元数据参数
#[napi(object)]
pub struct MetadataParam {
    pub title: String,
    /// Artist names exposed as separate MPRIS metadata values.
    pub artists: Vec<String>,
    pub album: String,
    /// 封面原始字节（用于系统媒体控件）
    pub cover_data: Option<Buffer>,
    /// Artwork URL used by MPRIS when embedded artwork bytes are unavailable.
    pub cover_url: Option<String>,
    /// 时长（毫秒）
    pub duration_ms: Option<f64>,
}

impl From<MetadataParam> for MetadataPayload {
    fn from(p: MetadataParam) -> Self {
        Self {
            title: p.title,
            artists: p.artists,
            album: p.album,
            cover_data: p.cover_data.map(|b| b.to_vec()),
            cover_url: p.cover_url,
            duration_ms: p.duration_ms,
        }
    }
}

#[napi(string_enum)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackStatus {
    Playing,
    Paused,
}

#[napi(string_enum)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RepeatMode {
    None,
    Track,
    List,
}

#[napi(object)]
#[derive(Debug, Clone, Copy)]
pub struct PlayStateParam {
    pub status: PlaybackStatus,
}

#[napi(object)]
#[derive(Debug, Clone, Copy)]
pub struct TimelineParam {
    /// 当前位置（毫秒）
    pub current_ms: f64,
    /// 总时长（毫秒）
    pub total_ms: f64,
    /// 是否为 seek 操作触发
    #[napi(js_name = "seeked")]
    pub seeked: Option<bool>,
}

#[napi(object)]
#[derive(Debug, Clone, Copy)]
pub struct PlayModeParam {
    pub shuffle: bool,
    pub repeat: RepeatMode,
}

#[cfg(test)]
mod tests {
    use super::{MediaEvent, MediaEventType, RepeatMode};

    #[test]
    fn mode_events_preserve_explicit_values() {
        let shuffle = MediaEvent::set_shuffle(false);
        assert_eq!(shuffle.type_, MediaEventType::SetShuffle);
        assert_eq!(shuffle.shuffle, Some(false));
        assert_eq!(shuffle.repeat, None);
        for mode in [RepeatMode::None, RepeatMode::Track, RepeatMode::List] {
            let repeat = MediaEvent::set_repeat(mode);
            assert_eq!(repeat.type_, MediaEventType::SetRepeat);
            assert_eq!(repeat.repeat, Some(mode));
            assert_eq!(repeat.shuffle, None);
        }
    }
}
