package nl.abektes.fichero.cloudnaming;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * One secret, encrypted at rest.
 *
 * The AES key lives in the Android Keystore: generated there, used there, never
 * exportable, and hardware-backed on any phone that has a TEE or StrongBox.
 * Only the ciphertext and its IV touch disk, in a private prefs file that the
 * backup rules exclude — a restored copy would be undecryptable on a new phone
 * anyway, because Keystore keys do not travel with backups.
 *
 * Hand-rolled rather than EncryptedSharedPreferences: androidx.security-crypto
 * is deprecated, and this is the whole of what it would have done for us.
 */
final class SecretBox {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "lia_openrouter_key";
    private static final String PREFS = "lia_secrets";
    private static final String FIELD = "openrouter";
    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;

    private final SharedPreferences prefs;

    SecretBox(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    boolean has() {
        return prefs.contains(FIELD);
    }

    void put(String secret) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORM);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        byte[] sealed = cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));

        String packed = Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP);
        // commit, not apply: the settings screen says "saved" right after this.
        prefs.edit().putString(FIELD, packed).commit();
    }

    /** Null when nothing is stored, or when what is stored can no longer be opened. */
    String get() {
        String packed = prefs.getString(FIELD, null);
        if (packed == null) {
            return null;
        }
        try {
            String[] parts = packed.split(":", 2);
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] sealed = Base64.decode(parts[1], Base64.NO_WRAP);

            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
        } catch (Exception e) {
            // A wiped Keystore (lock-screen reset, some OEM restores) leaves a
            // ciphertext nothing can open. Forget it so the UI asks again rather
            // than failing every call with a crypto error.
            clear();
            return null;
        }
    }

    void clear() {
        prefs.edit().remove(FIELD).commit();
    }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(ALIAS)) {
            return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }
}
