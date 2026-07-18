/**
 * Lightweight recording-merge checks against the production compose helper.
 * Run: node --experimental-strip-types scripts/recording-merge-check.mjs
 */
import assert from "node:assert/strict";
import { composeRecordingTracks } from "../src/lib/recordingStreams.ts";

function track(id, kind, readyState = "live") {
  return {
    id,
    kind,
    readyState,
    stop() {
      this.readyState = "ended";
    },
  };
}

const withMic = composeRecordingTracks({
  videoTracks: [track("v1", "video")],
  displayAudioTracks: [track("da1", "audio")],
  microphoneTracks: [track("m1", "audio")],
  wantMicrophone: true,
  microphoneDenied: false,
});
assert.equal(withMic.microphoneStatus, "active");
assert.equal(withMic.screenAudioStatus, "off");
assert.ok(withMic.selectedTracks.some((item) => item.id === "m1"));
assert.ok(withMic.orphanTracksToStop.some((item) => item.id === "da1"));

const denied = composeRecordingTracks({
  videoTracks: [track("v2", "video")],
  displayAudioTracks: [track("da2", "audio")],
  microphoneTracks: [],
  wantMicrophone: true,
  microphoneDenied: true,
});
assert.equal(denied.microphoneStatus, "denied");
assert.equal(denied.screenAudioStatus, "active");
assert.ok(denied.selectedTracks.some((item) => item.id === "da2"));

const noMic = composeRecordingTracks({
  videoTracks: [track("v3", "video")],
  displayAudioTracks: [track("da3", "audio")],
  microphoneTracks: [],
  wantMicrophone: false,
  microphoneDenied: false,
});
assert.equal(noMic.microphoneStatus, "off");
assert.equal(noMic.screenAudioStatus, "active");

console.log("recording merge checks passed");
