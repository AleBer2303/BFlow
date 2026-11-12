package com.bflow.widgets.storage

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Cifrado en reposo de las credenciales del widget: AES-256/GCM con una clave que nunca sale
 * del AndroidKeyStore (sin `androidx.security:security-crypto`, deprecada).
 *
 * Formato guardado: `v1:<base64 iv>:<base64 texto cifrado + etiqueta>`. Si la clave se pierde
 * (copia de seguridad restaurada en otro telefono, borrado del keystore) el descifrado falla,
 * se devuelve `null` y el widget queda "sin sesion" hasta que la app vuelva a llamar `setAuth`.
 */
internal object AuthCipher {
  private const val TAG = "BFlowWidgets"
  private const val KEYSTORE = "AndroidKeyStore"
  private const val KEY_ALIAS = "bflow_widget_auth_key_v1"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val TAG_LENGTH_BITS = 128
  private const val PREFIX = "v1"

  private val lock = Any()

  fun encrypt(plainText: String): String? = try {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    // El keystore genera un IV aleatorio por cifrado (setRandomizedEncryptionRequired).
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
    val encrypted = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
    val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    val body = Base64.encodeToString(encrypted, Base64.NO_WRAP)
    "$PREFIX:$iv:$body"
  } catch (error: GeneralSecurityException) {
    Log.w(TAG, "No se pudo cifrar con el AndroidKeyStore: ${error.javaClass.simpleName}")
    null
  } catch (error: RuntimeException) {
    // Algunos keystore de fabricante lanzan ProviderException / IllegalStateException.
    Log.w(TAG, "No se pudo cifrar con el AndroidKeyStore: ${error.javaClass.simpleName}")
    null
  }

  fun decrypt(stored: String?): String? {
    if (stored.isNullOrEmpty()) return null
    val parts = stored.split(':')
    if (parts.size != 3 || parts[0] != PREFIX) return null
    return try {
      val key = existingKey() ?: return null
      val iv = Base64.decode(parts[1], Base64.NO_WRAP)
      val body = Base64.decode(parts[2], Base64.NO_WRAP)
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_LENGTH_BITS, iv))
      String(cipher.doFinal(body), Charsets.UTF_8)
    } catch (error: GeneralSecurityException) {
      Log.w(TAG, "No se pudo descifrar la credencial del widget: ${error.javaClass.simpleName}")
      null
    } catch (error: RuntimeException) {
      Log.w(TAG, "No se pudo descifrar la credencial del widget: ${error.javaClass.simpleName}")
      null
    }
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  private fun existingKey(): SecretKey? = synchronized(lock) {
    (keyStore().getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey
  }

  private fun getOrCreateKey(): SecretKey = synchronized(lock) {
    existingKey() ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
      init(
        KeyGenParameterSpec.Builder(
          KEY_ALIAS,
          KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setKeySize(256)
          .build()
      )
      generateKey()
    }
  }
}
