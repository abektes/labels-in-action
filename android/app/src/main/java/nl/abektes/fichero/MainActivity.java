package nl.abektes.fichero;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import nl.abektes.fichero.cloudnaming.CloudNamingPlugin;
import nl.abektes.fichero.livelabels.LiveLabelsPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins are not discovered by cap sync the way npm ones are,
        // so the live-label camera has to be registered before the bridge starts.
        registerPlugin(LiveLabelsPlugin.class);
        registerPlugin(CloudNamingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
