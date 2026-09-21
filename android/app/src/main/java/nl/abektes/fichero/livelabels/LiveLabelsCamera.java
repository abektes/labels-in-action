package nl.abektes.fichero.livelabels;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.media.Image;
import android.net.Uri;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.common.model.LocalModel;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.objects.DetectedObject;
import com.google.mlkit.vision.objects.ObjectDetection;
import com.google.mlkit.vision.objects.ObjectDetector;
import com.google.mlkit.vision.objects.custom.CustomObjectDetectorOptions;

import org.json.JSONException;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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

    /**
     * Long edge of the JPEG handed to the naming model. The GenAI plugin decodes
     * whatever it is given at full resolution with no subsampling, so a 12MP
     * capture would be a ~48MB bitmap in its process; naming a jar needs nothing
     * like that.
     */
    private static final int NAMING_EDGE = 1024;

    private static final int JPEG_QUALITY = 85;

    private final LiveLabelsPlugin plugin;

    @Nullable
    private ProcessCameraProvider cameraProvider;
    @Nullable
    private PreviewView previewView;
    @Nullable
    private ObjectDetector detector;
    // volatile: bound and cleared on the UI thread, read on whichever thread
    // Capacitor happens to dispatch captureFrame() from.
    @Nullable
    private volatile ImageCapture imageCapture;

    /**
     * Decoding and re-encoding a still takes a couple of hundred milliseconds,
     * which is a visible stall on the main thread while the preview is live.
     * Never shut down: a takePicture() already in flight would come back to a
     * rejecting executor, and an executor that spawns its thread lazily costs
     * nothing on a run that never opens the camera.
     */
    private final ExecutorService captureExecutor = Executors.newSingleThreadExecutor();

    /**
     * The file handed out by the previous captureFrame(). Deleted when the next
     * one lands rather than immediately, because the WebView is still reading it
     * while naming runs.
     */
    @Nullable
    private volatile File lastFrame;

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
                /*
                 * The bundled EfficientNet-Lite2 replaces ML Kit's own
                 * classifier, which knows five categories and usually declines
                 * to guess at all — every box read "Object". This one knows the
                 * 1000 ImageNet classes, so boxes say "water bottle".
                 *
                 * STREAM_MODE keeps tracking ids stable between frames, which
                 * is what stops the overlay flickering as boxes are
                 * re-identified. It is also what makes a heavier classifier
                 * affordable: ML Kit classifies a tracked object occasionally
                 * rather than every frame, and KEEP_ONLY_LATEST drops whatever
                 * it cannot keep up with, so this degrades to a lower rate
                 * instead of stuttering the preview.
                 */
                LocalModel localModel = new LocalModel.Builder()
                    .setAssetFilePath("efficientnet_lite2.tflite")
                    .build();

                detector = ObjectDetection.getClient(
                    new CustomObjectDetectorOptions.Builder(localModel)
                        .setDetectorMode(CustomObjectDetectorOptions.STREAM_MODE)
                        .enableMultipleObjects()
                        .enableClassification()
                        // Below this the label is a guess not worth printing;
                        // the box still appears, just unnamed.
                        .setClassificationConfidenceThreshold(0.5f)
                        .setMaxPerObjectLabelCount(3)
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

                            // A third use case purely so "Name this" has a frame
                            // to send. The analyser's own ImageProxy is not it:
                            // holding one past analyze() to reuse later stalls a
                            // KEEP_ONLY_LATEST pipeline, and copying every frame
                            // just in case would cost ~13MB/s for a button that
                            // is pressed once. Preview + ImageAnalysis +
                            // ImageCapture is a guaranteed CameraX combination.
                            imageCapture = new ImageCapture.Builder()
                                // The user is pointing at a thing in real time;
                                // a snappy frame beats a better-exposed one.
                                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                                .build();

                            cameraProvider.unbindAll();
                            cameraProvider.bindToLifecycle(
                                (LifecycleOwner) plugin.getActivity(),
                                CameraSelector.DEFAULT_BACK_CAMERA,
                                preview,
                                analysis,
                                imageCapture
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
                imageCapture = null;
                if (detector != null) {
                    detector.close();
                    detector = null;
                }
                if (lastFrame != null) {
                    // Best-effort: the cache dir is the OS's to reclaim anyway.
                    lastFrame.delete();
                    lastFrame = null;
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

    /**
     * Freeze the frame the user is looking at and hand back a file:// URI.
     *
     * The whole frame, deliberately: the button asks "what is this?", not "what
     * is inside that box", so there is no crop to get wrong. The JPEG is written
     * already upright and already small, so the consumer can decode it naively.
     */
    void capture(@NonNull PluginCall call) {
        ImageCapture capture = imageCapture;
        if (!running || capture == null) {
            call.reject("The live camera isn't running.");
            return;
        }

        try {
            capture.takePicture(
                captureExecutor,
                new ImageCapture.OnImageCapturedCallback() {
                    @Override
                    public void onCaptureSuccess(@NonNull ImageProxy image) {
                        try {
                            File file = writeUprightJpeg(image);
                            if (lastFrame != null) {
                                lastFrame.delete();
                            }
                            lastFrame = file;

                            JSObject result = new JSObject();
                            result.put("path", Uri.fromFile(file).toString());
                            call.resolve(result);
                        } catch (Exception e) {
                            call.reject("The camera frame couldn't be saved: " + e.getMessage(), e);
                        } finally {
                            // Same discipline as analyze(): an ImageProxy left
                            // open holds a buffer the capture pipeline needs.
                            image.close();
                        }
                    }

                    @Override
                    public void onError(@NonNull ImageCaptureException e) {
                        call.reject(e.getMessage() == null ? e.toString() : e.getMessage(), e);
                    }
                }
            );
        } catch (Exception e) {
            // takePicture on a use case that was unbound between the null check
            // and here throws synchronously. A rejected call is recoverable; an
            // unresolved one leaves the button spinning forever.
            call.reject(e.getMessage() == null ? e.toString() : e.getMessage(), e);
        }
    }

    /**
     * JPEG bytes in, a small upright JPEG on disk out.
     *
     * Rotation is baked into the pixels rather than left as an EXIF tag because
     * plenty of decoders ignore the tag, and a sideways photo is a measurably
     * worse prompt.
     */
    @NonNull
    private File writeUprightJpeg(@NonNull ImageProxy image) throws IOException {
        ByteBuffer buffer = image.getPlanes()[0].getBuffer();
        byte[] jpeg = new byte[buffer.remaining()];
        buffer.get(jpeg);

        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length, bounds);

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize(Math.max(bounds.outWidth, bounds.outHeight));

        Bitmap decoded = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length, options);
        if (decoded == null) {
            throw new IOException("The captured frame could not be decoded.");
        }

        Bitmap upright = decoded;
        int rotation = image.getImageInfo().getRotationDegrees();
        if (rotation != 0) {
            Matrix matrix = new Matrix();
            matrix.postRotate(rotation);
            upright = Bitmap.createBitmap(
                decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), matrix, true
            );
            if (upright != decoded) {
                decoded.recycle();
            }
        }

        File file = File.createTempFile("live-frame", ".jpg", plugin.getContext().getCacheDir());
        try (FileOutputStream out = new FileOutputStream(file)) {
            upright.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out);
        } finally {
            upright.recycle();
        }

        return file;
    }

    /** Largest power-of-two subsample that still leaves NAMING_EDGE to work with. */
    private static int sampleSize(int longEdge) {
        int sample = 1;
        while (longEdge / (sample * 2) >= NAMING_EDGE) {
            sample *= 2;
        }
        return sample;
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
