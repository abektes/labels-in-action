package nl.abektes.fichero.cloudnaming;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The user's OpenRouter key, and the only code that ever holds it.
 *
 * The WebView can store a key, ask whether one is stored, and ask for a request
 * to be made with it — but never read it back. Requests go to two hard-coded
 * OpenRouter URLs, so nothing running in the web layer can point the key at
 * another host either. The worst a bug up there can do is spend credit, which
 * is what the key's own limit on openrouter.ai is for.
 *
 * Non-2xx responses resolve with their status and body so the web side can word
 * them; only transport failures (offline, timeout, TLS) reject.
 */
@CapacitorPlugin(name = "CloudNaming")
public class CloudNamingPlugin extends Plugin {

    private static final String CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
    private static final String KEY_URL = "https://openrouter.ai/api/v1/key";
    private static final int TIMEOUT_MS = 30_000;
    private static final int MAX_KEY_CHARS = 500;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private SecretBox box;

    @Override
    public void load() {
        box = new SecretBox(getContext());
    }

    @PluginMethod
    public void setKey(PluginCall call) {
        String key = call.getString("key", "");
        key = key == null ? "" : key.trim();
        if (key.isEmpty() || key.length() > MAX_KEY_CHARS || key.matches(".*\\s.*")) {
            call.reject("That doesn't look like an API key.");
            return;
        }
        try {
            box.put(key);
            call.resolve(status(key));
        } catch (Exception e) {
            call.reject("Couldn't store the key securely: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void clearKey(PluginCall call) {
        box.clear();
        call.resolve();
    }

    @PluginMethod
    public void keyStatus(PluginCall call) {
        call.resolve(status(box.get()));
    }

    @PluginMethod
    public void checkKey(PluginCall call) {
        send(call, KEY_URL, null);
    }

    @PluginMethod
    public void complete(PluginCall call) {
        String body = call.getString("body");
        if (body == null) {
            call.reject("Missing request body.");
            return;
        }
        send(call, CHAT_URL, body);
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdownNow();
        super.handleOnDestroy();
    }

    /** Enough to recognise which key is stored, not enough to use it. */
    private static JSObject status(String key) {
        JSObject out = new JSObject();
        out.put("configured", key != null);
        if (key != null) {
            String tail = key.length() > 4 ? key.substring(key.length() - 4) : "";
            out.put("hint", (key.startsWith("sk-or-") ? "sk-or-" : "") + "…" + tail);
        }
        return out;
    }

    private void send(PluginCall call, String url, String body) {
        String key = box.get();
        if (key == null) {
            call.reject("No OpenRouter key is stored.");
            return;
        }

        io.execute(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(TIMEOUT_MS);
                conn.setReadTimeout(TIMEOUT_MS);
                conn.setRequestProperty("Authorization", "Bearer " + key);
                // OpenRouter's app attribution headers: optional, harmless.
                conn.setRequestProperty("X-Title", "LIA label maker");

                if (body != null) {
                    conn.setRequestMethod("POST");
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json");
                    try (OutputStream out = conn.getOutputStream()) {
                        out.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                } else {
                    conn.setRequestMethod("GET");
                }

                int code = conn.getResponseCode();
                InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();

                JSObject result = new JSObject();
                result.put("status", code);
                result.put("body", in == null ? "" : read(in));
                call.resolve(result);
            } catch (Exception e) {
                // Deliberately not the URL or headers: a message that echoed the
                // request could carry the key into logs.
                call.reject("Network error: " + e.getClass().getSimpleName(), "NETWORK");
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    private static String read(InputStream in) throws Exception {
        try (InputStream stream = in; ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int n;
            while ((n = stream.read(chunk)) != -1) {
                buf.write(chunk, 0, n);
            }
            return buf.toString("UTF-8");
        }
    }
}
