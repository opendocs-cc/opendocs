/**
 * Google's folder picker. With the drive.file scope, OpenDocs can only
 * see folders someone picked here, so this is how folders are added.
 * https://developers.google.com/drive/picker/guides/overview
 */

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

let loading: Promise<void> | null = null;

function loadPicker(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const failed = () => {
      loading = null;
      reject(new Error("Couldn't load Google's folder picker. Check your connection and try again."));
    };
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => window.gapi.load("picker", { callback: () => resolve(), onerror: failed });
    script.onerror = failed;
    document.head.appendChild(script);
  });
  return loading;
}

export type PickedFolder = { id: string; name: string };

/** Open the picker on shared drives and My Drive. Resolves null if cancelled. */
export async function pickDriveFolder(config: {
  accessToken: string;
  apiKey: string;
  appId: string;
}): Promise<PickedFolder | null> {
  await loadPicker();
  const picker = window.google.picker;
  const folders = () =>
    new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(FOLDER_MIME);

  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .setTitle("Choose a folder for OpenDocs")
      .setAppId(config.appId)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.apiKey)
      .setOrigin(window.location.origin)
      .addView(folders().setEnableDrives(true))
      .addView(folders().setParent("root"))
      .setCallback((data: any) => {
        if (data.action === picker.Action.PICKED && data.docs?.[0]) {
          resolve({ id: data.docs[0].id, name: data.docs[0].name });
        } else if (data.action === picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build()
      .setVisible(true);
  });
}
