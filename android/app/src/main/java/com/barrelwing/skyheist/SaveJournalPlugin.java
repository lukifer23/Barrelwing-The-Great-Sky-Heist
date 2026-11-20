package com.barrelwing.skyheist;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SaveJournal")
public class SaveJournalPlugin extends Plugin {
    @PluginMethod
    public void write(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("Missing save snapshot.");
            return;
        }
        // Capacitor dispatches plugin methods on its handler thread. A single
        // disk commit makes both revisions durable before JavaScript can flush.
        SharedPreferences prefs = getContext().getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        boolean persisted = prefs.edit()
                .putString("barrelwing.save.v1", snapshot)
                .putString("barrelwing.save.v1.backup", snapshot)
                .commit();
        if (persisted) {
            call.resolve();
        } else {
            call.reject("Android could not commit the save file.");
        }
    }
}
