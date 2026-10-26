/** Login item identity registered on Windows. The unpackaged app runs through the
 * Electron binary, so the application path must travel as an argument; otherwise the
 * registry entry opens an empty Electron window at login. Electron quotes each
 * argument itself when writing the registry command. */
export function loginItemIdentity({ packaged, execPath, appPath }) {
  return { path: execPath, args: packaged ? [] : [appPath] };
}
