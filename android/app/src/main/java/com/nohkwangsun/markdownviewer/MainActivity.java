package com.nohkwangsun.markdownviewer;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * 파일 관리자에서 .md 파일을 열거나("연결 프로그램"), 다른 앱에서 "공유"로
 * 텍스트/파일을 보냈을 때 그 내용을 웹앱으로 넘긴다.
 *
 * 웹앱 쪽 진입점은 js/app.js 의 window.__mdViewerOpenFile(name, content) 이며,
 * 데스크탑(Electron)도 같은 함수를 쓴다.
 */
public class MainActivity extends BridgeActivity {

    private static final int MAX_WAIT_MS = 15000;
    private static final int RETRY_MS = 150;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        String name = null;
        String content = null;

        if (Intent.ACTION_VIEW.equals(action)) {
            Uri uri = intent.getData();
            if (uri != null) {
                name = queryDisplayName(uri);
                content = readUri(uri);
            }
        } else if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) {
                name = queryDisplayName(uri);
                content = readUri(uri);
            } else {
                // 파일이 아니라 텍스트를 공유한 경우
                CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (text != null) content = text.toString();
            }
        }

        if (content != null) deliverWhenReady(name, content);
    }

    /** content:// URI 에서 사람이 읽을 파일명을 얻는다. 실패하면 null. */
    private String queryDisplayName(Uri uri) {
        if ("file".equals(uri.getScheme())) return uri.getLastPathSegment();
        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return cursor.getString(idx);
            }
        } catch (Exception ignored) {
        }
        return uri.getLastPathSegment();
    }

    private String readUri(Uri uri) {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return null;
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[8192];
            int n;
            while ((n = reader.read(buf)) != -1) sb.append(buf, 0, n);
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 앱을 새로 켜면서 파일을 연 경우 웹뷰가 아직 준비되지 않았을 수 있다.
     * 웹앱의 진입점 함수가 생길 때까지 짧게 재시도한다.
     */
    private void deliverWhenReady(final String name, final String content) {
        final Handler handler = new Handler(Looper.getMainLooper());
        final long deadline = System.currentTimeMillis() + MAX_WAIT_MS;

        handler.post(new Runnable() {
            @Override
            public void run() {
                WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
                if (webView == null) {
                    if (System.currentTimeMillis() < deadline) handler.postDelayed(this, RETRY_MS);
                    return;
                }

                // 문자열은 JSON 으로 감싸 따옴표/줄바꿈을 안전하게 넘긴다
                String js =
                    "(function(){"
                        + "if(typeof window.__mdViewerOpenFile!=='function')return 'wait';"
                        + "window.__mdViewerOpenFile(" + jsonString(name) + "," + jsonString(content) + ");"
                        + "return 'ok';"
                        + "})()";

                final Runnable self = this;
                webView.evaluateJavascript(js, value -> {
                    boolean done = value != null && value.contains("ok");
                    if (!done && System.currentTimeMillis() < deadline) {
                        handler.postDelayed(self, RETRY_MS);
                    }
                });
            }
        });
    }

    private static String jsonString(String value) {
        return JSONObject.quote(value == null ? "" : value);
    }
}
