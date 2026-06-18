const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");

let mainWindow;
let lastUpdateStatus = {
  status: "idle",
  message: "Ready to check for updates.",
  version: app.getVersion()
};

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function sendUpdateStatus(status) {
  lastUpdateStatus = {
    ...lastUpdateStatus,
    ...status,
    version: app.getVersion()
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updates:status", lastUpdateStatus);
  }
}

function configureAutoUpdater() {
  autoUpdater.on("checking-for-update", () => {
    sendUpdateStatus({
      status: "checking",
      message: "Checking GitHub for the newest installer..."
    });
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateStatus({
      status: "available",
      message: `Version ${info.version} is available. Downloading it now...`,
      availableVersion: info.version
    });
    autoUpdater.downloadUpdate().catch((error) => {
      sendUpdateStatus({
        status: "error",
        message: `Could not download the update: ${error.message}`
      });
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdateStatus({
      status: "current",
      message: "This app is already up to date."
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent || 0);
    sendUpdateStatus({
      status: "downloading",
      message: `Downloading update... ${percent}%`
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdateStatus({
      status: "ready",
      message: `Version ${info.version} is ready. Restart the app to install it.`,
      availableVersion: info.version
    });
  });

  autoUpdater.on("error", (error) => {
    sendUpdateStatus({
      status: "error",
      message: `Update check failed: ${error.message}`
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1060,
    minHeight: 720,
    title: "회비 관리 · Payment Tracker",
    backgroundColor: "#f7f4ef",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("mailto:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }

    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("mailto:")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
  mainWindow.webContents.once("did-finish-load", () => {
    sendUpdateStatus(lastUpdateStatus);
  });
}

ipcMain.handle("updates:get-status", () => lastUpdateStatus);

ipcMain.handle("updates:check", async () => {
  if (!app.isPackaged) {
    sendUpdateStatus({
      status: "unavailable",
      message: "Updates are available in the installed Windows app."
    });
    return lastUpdateStatus;
  }

  await autoUpdater.checkForUpdates();
  return lastUpdateStatus;
});

ipcMain.handle("updates:install", () => {
  autoUpdater.quitAndInstall(false, true);
});

app.whenReady().then(() => {
  configureAutoUpdater();
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
