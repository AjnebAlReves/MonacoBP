<div class="box box-info">
    <div class="box-header with-border">
        <h3 class="box-title">Extension Info</h3>
    </div>
    <div class="box-body">
        <p>
            This extension is called <b>{{ $name }}</b>. <br>
            <code>{{ $identifier }}</code> is the identifier of this extension. <br>
            The current version is <i>{{ $version }}</i>. <br>
        </p>

        <hr>

        <!-- Contenedor para el editor -->
        <div id="editor-container" style="min-height: 400px; border: 1px solid #ccc;"></div>
        
        <!-- Editor fallback (oculto por defecto) -->
        <textarea id="fallback-editor" style="display: none; width: 100%; min-height: 400px;"></textarea>

        <button id="save-btn" class="btn btn-primary" style="margin-top: 10px;">Guardar cambios</button>
    </div>
</div>

@push('scripts')
<script>
    function isSmallScreen() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const ratio = (w / h).toFixed(2);
        const mobileUA = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        return mobileUA || w < 1024 || ratio === (9/16).toFixed(2) || ratio === (4/3).toFixed(2);
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (isSmallScreen()) {
            console.log("Pantalla pequeña detectada — usando editor fallback");
            document.getElementById('fallback-editor').style.display = 'block';
            document.getElementById('editor-container').style.display = 'none';
        } else {
            console.log("Pantalla grande detectada — cargando Monaco");
            loadMonaco();
        }
    });

    function loadMonaco() {
        require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.0/min/vs' }});
        require(['vs/editor/editor.main'], function () {
            window.monacoEditor = monaco.editor.create(document.getElementById('editor-container'), {
                value: "// Código aquí...",
                language: 'javascript',
                theme: 'vs-dark',
                automaticLayout: true
            });
        });
    }

    document.getElementById('save-btn').addEventListener('click', () => {
        const content = window.monacoEditor
            ? window.monacoEditor.getValue()
            : document.getElementById('fallback-editor').value;

        alert("Contenido guardado:\n" + content);
        // Aquí podrías hacer un POST a tu backend para guardar cambios
    });
</script>
@endpush
