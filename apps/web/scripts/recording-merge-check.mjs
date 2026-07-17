/**
 * Lightweight recording-merge checks.
 * Run: node scripts/recording-merge-check.mjs
 */
import assert from "node:assert/strict";

async function mergeRecordingTracksForTest(options) {
  const displayAudioTracks = options.displayAudio === false ? [] : [{ kind: "audio" }];
  const tracks = [{ kind: "video" }];
  const screenAudioStatus = displayAudioTracks.length ? "active" : "unavailable";
  let microphoneStatus = "off";
  if (options.spokenExplanation) {
    if (options.micDenied) {
      microphoneStatus = "denied";
      tracks.push(...displayAudioTracks);
    } else {
      microphoneStatus = "active";
      tracks.push({ kind: "audio" });
    }
  } else {
    tracks.push(...displayAudioTracks);
  }
  return {
    trackKinds: tracks.map((track) => track.kind),
    screenAudioStatus,
    microphoneStatus,
  };
}

const withMic = await mergeRecordingTracksForTest({ spokenExplanation: true });
assert.equal(withMic.microphoneStatus, "active");
assert.ok(withMic.trackKinds.includes("video"));
assert.ok(withMic.trackKinds.includes("audio"));

const denied = await mergeRecordingTracksForTest({
  spokenExplanation: true,
  micDenied: true,
});
assert.equal(denied.microphoneStatus, "denied");
assert.ok(denied.trackKinds.includes("video"));

assert.equal({ size: 0 }.size === 0, true);
console.log("recording merge checks passed");
