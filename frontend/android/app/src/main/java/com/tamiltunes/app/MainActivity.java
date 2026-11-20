package com.tamiltunes.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.ingageco.capacitormusiccontrols.MusicControlsNotificationKiller;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class); // our own plugin (in-app update); must be registered before super.onCreate
        super.onCreate(savedInstanceState);
        // Notification permission request is deferred until the user starts playing music,
        // with an in-app prompt and graceful denial handling.
    }

    @Override
    public void onPause() {
        super.onPause();
        // Capacitor's default bridge.onPause() pauses the WebView and its JS timers.
        // Keep the WebView and timers running ONLY while audio is actively playing in the foreground service.
        // If playback is paused or stopped, allow the WebView to pause normally to conserve CPU and battery.
        if (MusicControlsNotificationKiller.isPlaying) {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().onResume();
                getBridge().getWebView().resumeTimers();
            }
        }
    }
}
