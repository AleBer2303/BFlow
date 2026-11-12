package com.bflow.widgets.model

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class WidgetAuthTest {
  private fun valid(): JSONObject = JSONObject()
    .put("schemaVersion", 1)
    .put("uid", "uid_123")
    .put("refreshToken", "refresh-token")
    .put("apiKey", "api-key")
    .put("projectId", "bflow-app")

  @Test
  fun roundTripsThroughJson() {
    val auth = WidgetAuth.parse(valid().toString())
    assertNotNull(auth)
    assertEquals(auth, WidgetAuth.parse(auth!!.toJson()))
  }

  @Test
  fun rejectsInvalidCredentials() {
    assertNull(WidgetAuth.parse(null))
    assertNull(WidgetAuth.parse("{}"))
    assertNull(WidgetAuth.parse(valid().put("schemaVersion", 2).toString()))
    assertNull(WidgetAuth.parse(valid().put("uid", "").toString()))
    assertNull(WidgetAuth.parse(valid().put("projectId", "../evil").toString()))
    val missing = valid()
    missing.remove("refreshToken")
    assertNull(WidgetAuth.parse(missing.toString()))
  }

  @Test
  fun neverPrintsSecrets() {
    val text = WidgetAuth.parse(valid().toString()).toString()
    assertFalse(text.contains("refresh-token"))
    assertFalse(text.contains("api-key"))
    assertFalse(text.contains("uid_123"))
  }
}
