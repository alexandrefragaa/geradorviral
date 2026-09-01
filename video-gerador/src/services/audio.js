const ffmpeg = require("fluent-ffmpeg");

function removeVoiceSilence(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFilters([
        "silenceremove=start_periods=1:start_duration=0.12:start_threshold=-45dB",
        "silenceremove=stop_periods=-1:stop_duration=0.28:stop_threshold=-45dB",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
      ])
      .audioCodec("libmp3lame")
      .audioBitrate("192k")
      .format("mp3")
      .output(outputPath)
      .on("error", reject)
      .on("end", () => resolve(outputPath))
      .run();
  });
}

module.exports = { removeVoiceSilence };