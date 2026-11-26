package expo.modules.t3composereditor

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
internal object T3ChipIcons {
  private val images = HashMap<String, Bitmap>()
  fun cached(uri: String): Bitmap? = images[uri]

  fun load(context: Context, uri: String): Bitmap? =
    images[uri] ?: decodeLocal(context, uri)?.also { images[uri] = it }

  private fun decodeLocal(context: Context, uri: String): Bitmap? = runCatching {
    when {
      uri.startsWith("/") -> BitmapFactory.decodeFile(uri)
      uri.startsWith("file:") -> Uri.parse(uri).path?.let(BitmapFactory::decodeFile)
      else -> context.resources.getIdentifier(uri, "drawable", context.packageName)
        .takeIf { it != 0 }
        ?.let { BitmapFactory.decodeResource(context.resources, it) }
    }
  }.getOrNull()
}
