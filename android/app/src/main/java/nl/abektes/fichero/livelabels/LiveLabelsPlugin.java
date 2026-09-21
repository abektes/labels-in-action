package nl.abektes.fichero.livelabels;

import android.Manifest;

import androidx.annotation.NonNull;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.mlkit.vision.objects.DetectedObject;

import java.util.List;

/**
 * App-local Capacitor plugin: a live camera preview that streams detected
 * objects to the WebView so Svelte can float label chips over them.
 *
 * Local rather than an npm package because nothing here is reusable outside
 * this app — the whole point is the specific overlay the label designer draws.
 *
 * Detection is deliberately the only thing done per frame. Object detection's
 * own classifier knows five coarse categories, which is not a label anyone
 * wants printed; naming is a separate, slower step the user asks for with the
 * "Name this" button, which captureFrame() serves. This class does targeting
 * and capture, not naming — the model lives on the WebView side.
 */
@CapacitorPlugin(
    name = "LiveLabels",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = LiveLabelsPlugin.CAMERA)
    }
)
public class LiveLabelsPlugin extends Plugin {

    static final String CAMERA = "camera";

    private LiveLabelsCamera camera;

    @Override
    public void load() {
        camera = new LiveLabelsCamera(this);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        // The plugin being reachable at all is the answer: object detection is
        // bundled, so there is no model download to wait on.
        result.put("supported", true);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState(CAMERA) != PermissionState.GRANTED) {
            requestPermissionForAlias(CAMERA, call, "cameraPermissionCallback");
            return;
        }
        startCamera(call);
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (getPermissionState(CAMERA) != PermissionState.GRANTED) {
            call.reject("Camera permission is required for live labels.");
            return;
        }
        startCamera(call);
    }

    private void startCamera(PluginCall call) {
        try {
            camera.start();
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    /**
     * The one thing naming needs from the camera: a still of what it is looking
     * at right now, as a file the GenAI plugin can open. Cropping to a detected
     * box is deliberately not offered — the button asks about the scene.
     */
    @PluginMethod
    public void captureFrame(PluginCall call) {
        try {
            camera.capture(call);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            camera.stop();
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    /**
     * Stopping on the way out matters more than most teardown: the WebView is
     * transparent while the preview runs, so an Activity that pauses without
     * unwinding leaves the user staring at a blacked-out app on return.
     */
    @Override
    protected void handleOnPause() {
        if (camera != null && camera.isRunning()) {
            camera.stop();
            notifyListeners("liveLabelsStopped", new JSObject());
        }
        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() {
        if (camera != null) {
            camera.stop();
        }
        super.handleOnDestroy();
    }

    void notifyStarted() {
        notifyListeners("liveLabelsStarted", new JSObject());
    }

    void notifyObjects(@NonNull List<DetectedObject> objects, int sourceWidth, int sourceHeight) {
        try {
            JSArray array = new JSArray();
            for (DetectedObject object : objects) {
                array.put(LiveLabelsCamera.toJson(object, sourceWidth, sourceHeight));
            }

            JSObject payload = new JSObject();
            payload.put("objects", array);
            payload.put("sourceWidth", sourceWidth);
            payload.put("sourceHeight", sourceHeight);
            notifyListeners("objectsDetected", payload);
        } catch (Exception e) {
            // A frame that cannot be serialised is not worth killing the stream
            // over; the next one is 33ms away.
            notifyFailure(e);
        }
    }

    void notifyFailure(@NonNull Exception e) {
        JSObject payload = new JSObject();
        payload.put("message", e.getMessage() == null ? e.toString() : e.getMessage());
        notifyListeners("liveLabelsError", payload);
    }
}
