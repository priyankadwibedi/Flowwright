export type TrackStatus = "active" | "unavailable" | "denied" | "off";

export type TrackLike = {
  id: string;
  kind: string;
  readyState: string;
  stop: () => void;
};

export type ComposeRecordingTracksInput = {
  videoTracks: TrackLike[];
  displayAudioTracks: TrackLike[];
  microphoneTracks: TrackLike[];
  wantMicrophone: boolean;
  microphoneDenied: boolean;
};

export type ComposeRecordingTracksResult = {
  selectedTracks: TrackLike[];
  orphanTracksToStop: TrackLike[];
  screenAudioStatus: TrackStatus;
  microphoneStatus: TrackStatus;
};

function isLive(track: TrackLike): boolean {
  return track.readyState === "live";
}

/**
 * Shared production/test selection for combined recording tracks.
 * Microphone narration wins over display audio when a live mic track exists.
 * Statuses are derived only from tracks included in the final selection that are live.
 */
export function composeRecordingTracks(
  input: ComposeRecordingTracksInput,
): ComposeRecordingTracksResult {
  const selectedTracks: TrackLike[] = [...input.videoTracks];
  const orphanTracksToStop: TrackLike[] = [];
  const liveMicTracks = input.microphoneTracks.filter(isLive);
  const liveDisplayAudio = input.displayAudioTracks.filter(isLive);

  let microphoneStatus: TrackStatus = "off";
  if (input.wantMicrophone) {
    if (input.microphoneDenied) {
      microphoneStatus = "denied";
    } else if (liveMicTracks.length > 0) {
      microphoneStatus = "active";
      selectedTracks.push(...liveMicTracks);
    } else {
      microphoneStatus = "unavailable";
    }
  }

  if (microphoneStatus === "active") {
    orphanTracksToStop.push(...input.displayAudioTracks);
  } else if (liveDisplayAudio.length > 0) {
    selectedTracks.push(...liveDisplayAudio);
  } else {
    orphanTracksToStop.push(
      ...input.displayAudioTracks.filter((track) => !isLive(track)),
    );
  }

  const selectedIds = new Set(selectedTracks.map((track) => track.id));
  const includedLiveDisplayAudio = input.displayAudioTracks.some(
    (track) => selectedIds.has(track.id) && isLive(track),
  );
  const includedLiveMicrophone = input.microphoneTracks.some(
    (track) => selectedIds.has(track.id) && isLive(track),
  );

  const screenAudioStatus: TrackStatus = includedLiveDisplayAudio
    ? "active"
    : input.displayAudioTracks.length === 0
      ? "unavailable"
      : "off";

  if (input.wantMicrophone && !input.microphoneDenied) {
    microphoneStatus = includedLiveMicrophone ? "active" : "unavailable";
  } else if (input.microphoneDenied) {
    microphoneStatus = "denied";
  } else {
    microphoneStatus = "off";
  }

  return {
    selectedTracks,
    orphanTracksToStop,
    screenAudioStatus,
    microphoneStatus,
  };
}

export async function buildCombinedRecordingStream(options: {
  wantMicrophone: boolean;
  getDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia;
  getUserMedia: typeof navigator.mediaDevices.getUserMedia;
}): Promise<{
  stream: MediaStream;
  screenAudioStatus: TrackStatus;
  microphoneStatus: TrackStatus;
}> {
  const display = await options.getDisplayMedia({
    video: true,
    audio: true,
  });

  let microphone: MediaStream | null = null;
  let microphoneDenied = false;
  if (options.wantMicrophone) {
    try {
      microphone = await options.getUserMedia({
        audio: true,
        video: false,
      });
    } catch {
      microphoneDenied = true;
      microphone = null;
    }
  }

  const composed = composeRecordingTracks({
    videoTracks: display.getVideoTracks(),
    displayAudioTracks: display.getAudioTracks(),
    microphoneTracks: microphone?.getAudioTracks() ?? [],
    wantMicrophone: options.wantMicrophone,
    microphoneDenied,
  });

  for (const track of composed.orphanTracksToStop) {
    try {
      track.stop();
    } catch {
      // Ignore tracks that are already stopped.
    }
  }

  return {
    stream: new MediaStream(composed.selectedTracks as MediaStreamTrack[]),
    screenAudioStatus: composed.screenAudioStatus,
    microphoneStatus: composed.microphoneStatus,
  };
}
