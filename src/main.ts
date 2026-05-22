// Use the global `shaka` provided by the CDN script tag in index.html
declare const shaka: any;

const START_WITH_LOW_BITRATE = true;

const manifestUri = "https://vod-dash-ww-rd-live.akamaized.net/testcard/2/manifests/avc-full.mpd";

function initApp() {
  // Install built-in polyfills to patch browser incompatibilities.
  shaka.polyfill.installAll();

  // Check to see if the browser supports the basic APIs Shaka needs.
  if (shaka.Player.isBrowserSupported()) {
    // Everything looks good!
    initPlayer();
  } else {
    // This browser does not have the minimum set of APIs we need.
    console.error("Browser not supported!");
  }
}

async function initPlayer() {
  // Create a Player instance.
  const video = document.getElementById("video") as HTMLMediaElement;
  if (!video) {
    return;
  }

  const player = new shaka.Player(video);

  const shakaConfig: any = {
    //@ts-ignore test
    abr: {
      useNetworkInformation: !START_WITH_LOW_BITRATE,
    },
  };
  if (START_WITH_LOW_BITRATE) {
    shakaConfig.abr!.defaultBandwidthEstimate = 5e5;
  }
  player.configure(shakaConfig);

  // Attach player to the window to make it easy to access in the JS console.
  (window as any).player = player;

  // Ensure autoplay works in browsers with modern autoplay policies.
  video.autoplay = true;
  video.muted = true;

  // Wire up UI controls that interact with playback.
  const jumpBtn = document.getElementById("jump-12s");
  if (jumpBtn) {
    jumpBtn.addEventListener("click", () => {
      const duration = Number.isFinite(video.duration) ? video.duration : NaN;
      let target = 0;
      if (Number.isFinite(duration)) {
        target = Math.max(0, duration - 12);
      }
      logMessage(`Jumping to ${target.toFixed(1)}s`);
      try {
        if (player && typeof (player as any).seek === "function") {
          (player as any).seek(target);
        } else {
          video.currentTime = target;
        }
      } catch (err) {
        video.currentTime = target;
      }
    });
  }

  let preloadStarted = false;
  let preloadManager: any | null = null;

  const logMessage = (message: string) => {
    const log = document.getElementById("player-log");
    if (log) {
      const line = document.createElement("div");
      line.textContent = message;
      log.appendChild(line);
    }
  };

  const logBitrate = (message: string) => {
    const history = document.getElementById("bitrate-history");
    if (history) {
      const line = document.createElement("div");
      line.textContent = message;
      history.appendChild(line);
    }
  };

  const clearBitrateHistory = () => {
    const history = document.getElementById("bitrate-history");
    if (history) {
      history.innerHTML = "<strong>Bitrate history:</strong>";
    }
  };

  const logCurrentBitrate = () => {
    try {
      const tracks = player.getVariantTracks();
      const active = tracks.find((track) => track.active);
      if (active) {
        logBitrate(
          `Time ${video.currentTime.toFixed(1)}s — bitrate: ${Math.round(active.bandwidth / 1000)} kbps, resolution: ${active.width}x${active.height}`,
        );
      }
    } catch (error) {
      // ignore if getVariantTracks isn't available yet
    }
  };

  player.addEventListener("adaptation", (event: any) => {
    const oldTrack = event.oldTrack as any;
    const newTrack = event.newTrack as any;
    if (newTrack) {
      logBitrate(
        `Adaptation: ${newTrack.type || "variant"} switched to ${Math.round(newTrack.bandwidth / 1000)} kbps (${newTrack.width}x${newTrack.height})`,
      );
    } else {
      logBitrate("Adaptation: track changed.");
    }
  });

  video.addEventListener("timeupdate", async () => {
    if (preloadStarted) {
      return;
    }

    const remaining = video.duration - video.currentTime;
    if (!Number.isFinite(remaining) || remaining > 10) {
      return;
    }

    preloadStarted = true;
    logMessage("We have preload");

    try {
      preloadManager = await player.preload(manifestUri);
      if (preloadManager) {
        logMessage("Preload manager started for manifestUri.");
      } else {
        logMessage("Preload returned null; asset cannot be preloaded.");
      }
    } catch (error) {
      logMessage(`Preload failed: ${error}`);
      console.warn("Preload failed:", error);
    }
  });

  video.addEventListener("ended", async () => {
    if (!preloadManager) {
      return;
    }

    logMessage("Loading preloaded content after video ended...");
    try {
      clearBitrateHistory();
      await player.load(preloadManager);
      logMessage("Loaded preloaded asset successfully.");
      preloadManager = null;
      logCurrentBitrate();
      await video.play().catch((error) => {
        console.warn("Play after preload load failed:", error);
      });
    } catch (error) {
      logMessage(`Failed to load preloaded asset: ${error}`);
      console.error("Failed to load preloaded asset:", error);
    }
  });

  // Listen for error events.
  player.addEventListener("error", onErrorEvent);

  // Try to load a manifest.
  // This is an asynchronous process.
  try {
    clearBitrateHistory();
    await player.load(manifestUri);
    logCurrentBitrate();
    await video.play().catch((error) => {
      console.warn("Autoplay prevented or failed:", error);
    });
    //await player.addTextTrackAsync("./test.ass", "en-US", "text/x-ssa");
    //player.setTextTrackVisibility(true);
    // This runs if the asynchronous load is successful.
    //console.log("The video has now been loaded!");
  } catch (e) {
    // onError is executed if the asynchronous load fails.
    onError(e);
  }
}

function onErrorEvent(event: any) {
  // Extract the shaka.util.Error object from the event.
  onError(event.detail);
}

function onError(error: any) {
  // Log the error.
  console.error("Error code", error.code, "object", error);
}

document.addEventListener("DOMContentLoaded", initApp);
