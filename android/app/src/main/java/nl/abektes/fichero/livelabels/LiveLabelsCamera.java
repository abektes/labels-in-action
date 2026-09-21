package nl.abektes.fichero.livelabels;

import android.graphics.Color;
import android.graphics.Rect;
import android.media.Image;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.objects.DetectedObject;
import com.google.mlkit.vision.objects.ObjectDetection;
import com.google.mlkit.vision.objects.ObjectDetector;
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions;

import org.json.JSONException;

/**
 * A live camera preview with per-frame object detection.
 *
 * The preview is a CameraX PreviewView inserted *behind* the Capacitor WebView,
 * which is made transparent for the duration. That is the same arrangement the
 * ML Kit barcode plugin uses, and it means the label overlay is ordinary HTML
 * drawn by Svelte rather than anything rendered natively.
 *
 * Boxes are emitted as fractions of the source frame rather than pixels. The
 * WebView has no idea what resolution the analyser ran at, and the preview is
 * cropped to fill the screen, so fractions plus the source aspect ratio are the
 * only things that let the overlay place a box correctly on any device.
 */
class LiveLabelsCamera implements ImageAnalysis.Analyzer {

    private final LiveLabelsPlugin plugin;

    @Nullable
    private ProcessCameraProvider cameraProvider;
    @Nullable
    private PreviewView previewView;
    @Nullable
    private ObjectDetector detector;

    private volatile boolean running = false;

    LiveLabelsCamera(@NonNull LiveLabelsPlugin plugin) {
        this.plugin = plugin;
    }

    boolean isRunning() {
        return running;
    }

    void start() {
        plugin.getActivity().runOnUiThread(() -> {
            try {
                // STREAM_MODE keeps tracking ids stable between frames, which is
                // what stops the overlay flickering as boxes are re-identified.
                detector = ObjectDetection.getClient(
                    new ObjectDetectorOptions.Builder()
                        .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)
                        .enableMultipleObjects()
                        .enableClassification()
                        .build()
                );

                previewView = new PreviewView(plugin.getActivity());
                previewView.setLayoutParams(
                    new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                );
                previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
                previewView.setBackgroundColor(Color.BLACK);

                ViewGroup parent = (ViewGroup) plugin.getBridge().getWebView().getParent();
                parent.addView(previewView, 0);
                plugin.getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);

                ListenableFuture<ProcessCameraProvider> future =
                    ProcessCameraProvider.getInstance(plugin.getContext());

                future.addListener(
                    () -> {
                        try {
                            cameraProvider = future.get();

                            ImageAnalysis analysis = new ImageAnalysis.Builder()
                                // Drop frames rather than queue them: a backlog
                                // would show the user boxes for a scene they have
                                // already moved away from.
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .build();
                            analysis.setAnalyzer(
                                ContextCompat.getMainExecutor(plugin.getContext()),
                                this
                            );

                            Preview preview = new Preview.Builder().build();
                            preview.setSurfaceProvider(previewView.getSurfaceProvider());

                            cameraProvider.unbindAll();
                            cameraProvider.bindToLifecycle(
                                (LifecycleOwner) plugin.getActivity(),
                                CameraSelector.DEFAULT_BACK_CAMERA,
                                preview,
                                analysis
                            );

                            running = true;
                            plugin.notifyStarted();
                        } catch (Exception e) {
                            // Leaving the WebView transparent over a dead preview
                            // would black out the whole app, so unwind fully.
                            stop();
                            plugin.notifyFailure(e);
                        }
                    },
                    ContextCompat.getMainExecutor(plugin.getContext())
                );
            } catch (Exception e) {
                stop();
                plugin.notifyFailure(e);
            }
        });
    }

    void stop() {
        running = false;
        plugin.getActivity().runOnUiThread(() -> {
            try {
                if (cameraProvider != null) {
                    cameraProvider.unbindAll();
                    cameraProvider = null;
                }
                if (detector != null) {
                    detector.close();
                    detector = null;
                }
                if (previewView != null) {
                    ViewGroup parent = (ViewGroup) previewView.getParent();
                    if (parent != null) {
                        parent.removeView(previewView);
                    }
                    previewView = null;
                }
            } catch (Exception ignored) {
                // Teardown is best-effort; restoring the WebView below is not.
            } finally {
                // Unconditional: a transparent WebView with no preview behind it
                // is an app that looks broken.
                plugin.getBridge().getWebView().setBackgroundColor(Color.WHITE);
            }
        });
    }

    @Override
    public void analyze(@NonNull ImageProxy imageProxy) {
        Image image = imageProxy.getImage();
        ObjectDetector current = detector;

        if (image == null || current == null || !running) {
            imageProxy.close();
            return;
        }

        int rotation = imageProxy.getImageInfo().getRotationDegrees();
        // After rotation the analyser's own width/height swap, and the fractions
        // below must be taken against the upright frame the user is looking at.
        boolean swapped = rotation == 90 || rotation == 270;
        int sourceWidth = swapped ? imageProxy.getHeight() : imageProxy.getWidth();
        int sourceHeight = swapped ? imageProxy.getWidth() : imageProxy.getHeight();

        InputImage inputImage = InputImage.fromMediaImage(image, rotation);

        current
            .process(inputImage)
            .addOnSuccessListener(objects -> plugin.notifyObjects(objects, sourceWidth, sourceHeight))
            .addOnFailureListener(plugin::notifyFailure)
            // close() must happen on every path or the pipeline stalls after a
            // couple of frames and the preview freezes.
            .addOnCompleteListener(task -> imageProxy.close());
    }

    static JSObject toJson(@NonNull DetectedObject object, int sourceWidth, int sourceHeight)
        throws JSONException {
        Rect box = object.getBoundingBox();
        JSObject json = new JSObject();

        Integer trackingId = object.getTrackingId();
        json.put("trackingId", trackingId == null ? -1 : trackingId.intValue());

        // Fractions, not pixels — see the class comment.
        json.put("left", clamp01((float) box.left / sourceWidth));
        json.put("top", clamp01((float) box.top / sourceHeight));
        json.put("width", clamp01((float) box.width() / sourceWidth));
        json.put("height", clamp01((float) box.height() / sourceHeight));

        JSArray labels = new JSArray();
        for (DetectedObject.Label label : object.getLabels()) {
            JSObject l = new JSObject();
            l.put("text", label.getText());
            l.put("confidence", label.getConfidence());
            labels.put(l);
        }
        json.put("labels", labels);

        return json;
    }

    private static float clamp01(float v) {
        if (v < 0f) return 0f;
        if (v > 1f) return 1f;
        return v;
    }
}
