package com.barrelwing.skyheist;

import android.os.Bundle;
import android.os.Build;
import android.content.res.Configuration;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemBars();
        requestGameFrameRate();
        // Pixel art uses a modest WebGL backing buffer; the native compositor
        // scales it to the physical display using hardware acceleration.
        getBridge().getWebView().setBackgroundColor(0xff070a14);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) { hideSystemBars(); requestGameFrameRate(); }
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        requestGameFrameRate();
    }

    private void requestGameFrameRate() {
        WindowManager.LayoutParams attributes = getWindow().getAttributes();
        attributes.preferredRefreshRate = 60f;
        getWindow().setAttributes(attributes);
        if (Build.VERSION.SDK_INT >= 35 && getBridge() != null) {
            getBridge().getWebView().setRequestedFrameRate(60f);
        }
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
