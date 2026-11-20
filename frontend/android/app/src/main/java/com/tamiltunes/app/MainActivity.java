package com.tamiltunes.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.ingageco.capacitormusiccontrols.MusicControlsNotificationKiller;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class); // our own plugin (in-app update); must be registered before super.onCreate
        super.onCreate(savedInstanceState);
        // Ensure background / autonomous playback handover does not require explicit user gestures on track change
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Capacitor's default bridge.onPause() pauses the WebView and its JS timers.
        // Keep the WebView and timers running while audio is actively playing or transitioning between tracks in the foreground service.
        // If playback is paused or stopped, allow the WebView to pause normally to conserve CPU and battery.
        if (MusicControlsNotificationKiller.isPlaying || MusicControlsNotificationKiller.isTransitioning) {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().onResume();
                getBridge().getWebView().resumeTimers();
            }
        }
    }
}
