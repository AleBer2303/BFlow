package com.bflow.widgets.sync

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SecureTokenErrorsTest {
  private fun body(message: String, code: Int = 400) =
    """{"error":{"code":$code,"message":"$message","status":"INVALID_ARGUMENT"}}"""

  @Test
  fun definitiveErrorsStopTheRefresh() {
    assertTrue(SecureTokenErrors.isDefinitive(body("TOKEN_EXPIRED")))
    assertTrue(SecureTokenErrors.isDefinitive(body("INVALID_REFRESH_TOKEN")))
    assertTrue(SecureTokenErrors.isDefinitive(body("USER_DISABLED")))
    assertTrue(SecureTokenErrors.isDefinitive(body("USER_NOT_FOUND : The user may have been deleted.")))
  }

  @Test
  fun configurationAndUnknownErrorsAreTransient() {
    // API key restringida a otra app / SHA-1 no registrado.
    assertFalse(SecureTokenErrors.isDefinitive(body("Requests from this Android client application com.bflow.app are blocked.", 403)))
    assertFalse(SecureTokenErrors.isDefinitive(body("API key not valid. Please pass a valid API key.")))
    assertFalse(SecureTokenErrors.isDefinitive(body("INVALID_GRANT_TYPE")))
    assertFalse(SecureTokenErrors.isDefinitive(body("TOKEN_EXPIRED_SOON")))
    assertFalse(SecureTokenErrors.isDefinitive(null))
    assertFalse(SecureTokenErrors.isDefinitive(""))
    assertFalse(SecureTokenErrors.isDefinitive("<html>error</html>"))
    assertFalse(SecureTokenErrors.isDefinitive("""{"error":"TOKEN_EXPIRED"}"""))
  }
}
