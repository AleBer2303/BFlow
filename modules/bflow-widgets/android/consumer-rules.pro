# Reglas R8 del modulo bflow-widgets (se suman al release de la app; ver ADR 0013 y 0021).

# El modulo Expo se instancia por nombre desde ExpoModulesPackageList; expo-modules-core ya
# conserva el constructor y definition() de toda subclase de Module, pero el nombre de la
# clase se fija aqui para que el registro "BFlowWidgets" no dependa de esa regla.
-keep class com.bflow.widgets.BFlowWidgetsModule { *; }

# Los proveedores de widgets los instancia el sistema por el nombre del manifiesto.
-keep class * extends android.appwidget.AppWidgetProvider

# WorkManager instancia el worker por nombre con (Context, WorkerParameters). work-runtime ya
# publica keepnames para ListenableWorker; se repite para no depender de su version.
-keep class com.bflow.widgets.sync.WidgetSyncWorker {
  public <init>(android.content.Context, androidx.work.WorkerParameters);
}
