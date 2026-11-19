package com.tamiltunes.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.StatFs;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.security.MessageDigest;

/**
 * In-app update for the Android app (the only code in the app that downloads a file, and the only file it ever stores).
 *  - fetchText: reads version.json from this repository's GitHub Releases.
 *  - download:  saves the release APK in the app's private CACHE folder, checks its SHA-256, deletes it when the hash is wrong.
 *  - install:   hands the file to Android's package installer through the FileProvider.
 * Only https://github.com/<REPO>/releases/... is accepted as a start address and every redirect hop must be https on a GitHub host.
 * No credential, no external storage, no other host. The same rules are in src/lib/appUpdate.js (a test keeps the two in step).
 * Error codes (the second argument of reject) are the ones listed in updateErrorMessage() in appUpdate.js.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    static final String REPO = "Deepak-G-T/tamiltunes";
    static final String[] HOSTS = {"github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"};
    private static final int MAX_REDIRECTS = 5;
    private static final long MAX_TEXT_BYTES = 64 * 1024;
    private static final long MAX_APK_BYTES = 200L * 1024 * 1024;
    private static final String DIR_NAME = "updates";
    private static final String APK_NAME = "TamilTunes-update.apk";
    private static final String PART_NAME = "TamilTunes-update.apk.part";

    private volatile boolean cancelled = false;

    /** Thrown with one of the error codes. */
    private static final class UpdateException extends Exception {
        UpdateException(String code) { super(code); }
    }

    // ---------------------------------------------------------------- rules

    private static boolean isAllowedStart(String url) {
        try {
            URL u = new URL(url);
            return "https".equals(u.getProtocol()) && "github.com".equals(u.getHost()) && u.getPort() == -1
                    && u.getUserInfo() == null && u.getPath().startsWith("/" + REPO + "/releases/");
        } catch (Exception e) {
            return false;
        }
    }

    private static boolean isAllowedHop(URL u) {
        if (!"https".equals(u.getProtocol()) || u.getPort() != -1 || u.getUserInfo() != null) return false;
        String host = u.getHost().toLowerCase();
        for (String h : HOSTS) { if (h.equals(host)) return true; }
        return false;
    }

    private File updatesDir() {
        File dir = new File(getContext().getCacheDir(), DIR_NAME);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /** Opens the address, following redirects by hand so that every hop is checked. */
    private HttpURLConnection open(String start) throws IOException, UpdateException {
        if (!isAllowedStart(start)) throw new UpdateException("not_allowed");
        String url = start;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            URL u = new URL(url);
            if (!isAllowedHop(u)) throw new UpdateException("not_allowed");
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "TamilTunes-app-updater");
            c.setRequestProperty("Accept", "application/octet-stream, application/json, */*");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null || loc.isEmpty()) throw new UpdateException("failed");
                url = new URL(u, loc).toString();
                continue;
            }
            if (code == 403 || code == 429) { c.disconnect(); throw new UpdateException("rate_limited"); }
            if (code == 404) { c.disconnect(); throw new UpdateException("no_release"); }
            if (code < 200 || code >= 300) { c.disconnect(); throw new UpdateException("failed"); }
            return c;
        }
        throw new UpdateException("failed");
    }

    private static String codeOf(Exception e) {
        if (e instanceof UpdateException) return e.getMessage();
        if (e instanceof UnknownHostException || e instanceof SocketTimeoutException) return "offline";
        String m = String.valueOf(e.getMessage());
        if (m.contains("ENOSPC") || m.toLowerCase().contains("no space left")) return "low_storage";
        if (e instanceof java.net.ConnectException || e instanceof java.net.NoRouteToHostException) return "offline";
        return "failed";
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    // -------------------------------------------------------------- methods

    @PluginMethod
    public void getInstalled(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            JSObject ret = new JSObject();
            ret.put("versionName", pi.versionName == null ? "" : pi.versionName);
            ret.put("versionCode", code);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("failed", "failed");
        }
    }

    @PluginMethod
    public void fetchText(PluginCall call) {
        String url = call.getString("url");
        if (url == null) { call.reject("not_allowed", "not_allowed"); return; }
        HttpURLConnection c = null;
        try {
            c = open(url);
            InputStream in = c.getInputStream();
            byte[] buf = new byte[4096];
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_TEXT_BYTES) throw new UpdateException("failed");
            }
            in.close();
            JSObject ret = new JSObject();
            ret.put("text", out.toString("UTF-8"));
            call.resolve(ret);
        } catch (Exception e) {
            String code = codeOf(e);
            call.reject(code, code);
        } finally {
            if (c != null) c.disconnect();
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String url = call.getString("url");
        final String expected = call.getString("sha256") == null ? "" : call.getString("sha256").toLowerCase();
        final long expectedSize = call.getLong("size") == null ? 0L : call.getLong("size");
        if (url == null || !expected.matches("[0-9a-f]{64}")) { call.reject("not_allowed", "not_allowed"); return; }
        cancelled = false;
        File dir = updatesDir();
        File part = new File(dir, PART_NAME);
        File apk = new File(dir, APK_NAME);
        part.delete();
        apk.delete();
        HttpURLConnection c = null;
        try {
            if (expectedSize > 0) {
                StatFs fs = new StatFs(dir.getPath());
                if (fs.getAvailableBytes() < expectedSize * 2) throw new UpdateException("low_storage");
            }
            c = open(url);
            long total = c.getContentLengthLong();
            if (total > MAX_APK_BYTES || expectedSize > MAX_APK_BYTES) throw new UpdateException("failed");
            if (total <= 0) total = expectedSize;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            InputStream in = c.getInputStream();
            OutputStream out = new FileOutputStream(part);
            byte[] buf = new byte[16 * 1024];
            long received = 0;
            long lastEmit = 0;
            int n;
            try {
                while ((n = in.read(buf)) > 0) {
                    if (cancelled) throw new UpdateException("cancelled");
                    out.write(buf, 0, n);
                    md.update(buf, 0, n);
                    received += n;
                    if (received > MAX_APK_BYTES) throw new UpdateException("failed");
                    long now = System.currentTimeMillis();
                    if (now - lastEmit > 100) {
                        lastEmit = now;
                        JSObject p = new JSObject();
                        p.put("received", received);
                        p.put("total", total);
                        notifyListeners("progress", p);
                    }
                }
            } finally {
                out.close();
                in.close();
            }
            String actual = hex(md.digest());
            if (!actual.equals(expected)) throw new UpdateException("hash_mismatch");
            if (!part.renameTo(apk)) throw new UpdateException("failed");
            JSObject done = new JSObject();
            done.put("received", received);
            done.put("total", total);
            notifyListeners("progress", done);
            JSObject ret = new JSObject();
            ret.put("bytes", received);
            ret.put("sha256", actual);
            call.resolve(ret);
        } catch (Exception e) {
            part.delete();
            apk.delete();
            String code = codeOf(e);
            call.reject(code, code);
        } finally {
            if (c != null) c.disconnect();
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject ret = new JSObject();
        ret.put("allowed", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("failed", "failed");
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        try {
            File apk = new File(updatesDir(), APK_NAME);
            if (!apk.isFile()) throw new UpdateException("failed");
            if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) throw new UpdateException("need_permission");
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            String code = codeOf(e);
            call.reject(code, code);
        }
    }

    /** Deletes a downloaded update (after installing, after a failure, when the person says Later, and at every start). */
    @PluginMethod
    public void cleanup(PluginCall call) {
        File dir = new File(getContext().getCacheDir(), DIR_NAME);
        File[] files = dir.listFiles();
        if (files != null) { for (File f : files) f.delete(); }
        call.resolve();
    }
}
