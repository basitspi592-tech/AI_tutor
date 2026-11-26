/** Gemini TTS emits canonical PCM WAV, so the RIFF header yields an exact
 *  duration without shelling out to ffprobe (ffmpeg-static ships none). */
export function wavDurationSeconds(buf: Buffer): number {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Narration audio had an unexpected format");
  }

  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(offset + 16);
    if (id === "data") {
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (!byteRate || !dataSize) {
    throw new Error("Narration audio had an unexpected format");
  }
  return dataSize / byteRate;
}
