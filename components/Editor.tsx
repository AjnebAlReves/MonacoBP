import React, { useEffect, useRef, useState } from 'react';
import { useHistory, useLocation, useParams } from 'react-router';
import { dirname } from 'path';

import { encodePathSegments, hashToPath } from '@/helpers';
import { httpErrorToHuman } from '@/api/http';
import getFileContents from '@/api/server/files/getFileContents';
import saveFileContents from '@/api/server/files/saveFileContents';
import FileNameModal from '@/components/server/files/FileNameModal';
import { ServerContext } from '@/state/server';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import useFlash from '@/plugins/useFlash';
import Can from '@/components/elements/Can';
import Select from '@/components/elements/Select';
import Button from '@/components/elements/Button';
import modes from '@/modes';

declare global {
    interface Window {
        monaco: any;
        require: any;
    }
}

// Añadir estilos responsivos para los botones
const addButtonStyles = () => {
    const styleId = 'responsive-button-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .responsive-button-group {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
                justify-content: flex-end;
            }
            .responsive-button {
                flex: 1 1 180px;
                min-width: 120px;
                white-space: nowrap;
            }
            @media (min-width: 640px) {
                .responsive-button {
                    flex: none;
                    min-width: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }
};

const Editor = () => {
    const { hash } = useLocation();
    const history = useHistory();
    const { action } = useParams<{ action: 'new' | string }>();

    const [content, setContent] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [loading, setLoading] = useState(action === 'edit');
    const [editorLoaded, setEditorLoaded] = useState(false);
    const [lang, setLang] = useState('text/plain');
    const [isMobile, setIsMobile] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<any>(null);

    const id = ServerContext.useStoreState((state) => state.server.data!.id);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const setDirectory = ServerContext.useStoreActions((actions) => actions.files.setDirectory);
    const { addError, clearFlashes } = useFlash();

    // Detectar si es dispositivo móvil
    useEffect(() => {
        const checkMobile = () => {
            const mobileUA = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
            const isSmall = window.innerWidth < 768;
            setIsMobile(mobileUA || isSmall);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Cargar estilos responsivos
    useEffect(() => {
        addButtonStyles();
    }, []);

    // Detección de lenguaje por extensión
    const detectLanguageFromPath = (filePath: string): string => {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const map: { [key: string]: string } = {
            js: 'text/javascript', jsx: 'text/javascript',
            ts: 'application/typescript', tsx: 'application/typescript',
            html: 'text/html', htm: 'text/html',
            css: 'text/css', scss: 'text/x-scss',
            json: 'application/json', yaml: 'text/x-yaml', yml: 'text/x-yaml',
            py: 'text/x-python', php: 'text/x-php',
            java: 'text/x-java', c: 'text/x-csrc', cpp: 'text/x-c++src',
            md: 'text/x-markdown', txt: 'text/plain',
            sh: 'text/x-sh', dockerfile: 'text/x-dockerfile',
            sql: 'text/x-sql', vue: 'script/x-vue'
        };
        return map[ext || ''] || 'text/plain';
    };

    // Mapeo MIME → Monaco/CodeMirror
    const getLanguageId = (mimeType: string): string => {
        const map: { [key: string]: string } = {
            'text/plain': 'plaintext',
            'application/json': 'json',
            'text/javascript': 'javascript',
            'application/typescript': 'typescript',
            'text/html': 'html',
            'text/css': 'css',
            'text/x-yaml': 'yaml',
            'text/x-python': 'python',
            'text/x-php': 'php',
            'text/x-java': 'java',
            'text/x-csrc': 'c',
            'text/x-c++src': 'cpp',
            'text/x-markdown': 'markdown',
            'text/x-sh': 'shell',
            'text/x-dockerfile': 'dockerfile',
            'text/x-sql': 'sql',
            'script/x-vue': 'html'
        };
        return map[mimeType] || 'plaintext';
    };

    // Detectar lenguaje al cargar
    useEffect(() => {
        if (action === 'edit' && hash) {
            const path = hashToPath(hash);
            setLang(detectLanguageFromPath(path));
        }
    }, [action, hash]);

    // Guardar archivo
    const save = (name?: string) => {
        if (!editorRef.current) return;

        setLoading(true);
        clearFlashes('files:view');

        const editorContent = editorRef.current.getValue();
        const filePath = name || hashToPath(hash);

        saveFileContents(uuid, filePath, editorContent)
            .then(() => {
                setContent(editorContent);
                if (name) {
                    history.push(`/server/${id}/files/edit#/${encodePathSegments(name)}`);
                    setDirectory(dirname(name));
                }
            })
            .catch((error) => {
                console.error('Error saving file:', error);
                addError({ message: httpErrorToHuman(error), key: 'files:view' });
            })
            .finally(() => setLoading(false));
    };

    // Cargar contenido del archivo
    useEffect(() => {
        if (action === 'new') return;

        setLoading(true);
        const path = hashToPath(hash);
        setDirectory(dirname(path));

        getFileContents(uuid, path)
            .then(setContent)
            .catch((error) => {
                addError({ message: httpErrorToHuman(error), key: 'files:view' });
            })
            .finally(() => setLoading(false));
    }, [action, uuid, hash]);

    // Cargar editor (Monaco o CodeMirror)
    useEffect(() => {
        if (editorLoaded || !containerRef.current) return;

        if (isMobile) {
            // === Cargar CodeMirror 6 ===
            const loadCodeMirror = () => {
                const [cmScript, cmStyle] = ['lib/codemirror.js', 'lib/codemirror.css'].map(file => {
                    const el = document.createElement('link');
                    el.rel = 'stylesheet';
                    el.href = `https://cdn.jsdelivr.net/npm/codemirror@6.0.2/${file}`;
                    return el;
                });
                document.head.appendChild(cmStyle);

                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/codemirror@6.0.2/lib/codemirror.min.js';
                script.onload = () => {
                    // Cargar extensiones según el lenguaje
                    const lang = getLanguageId(detectLanguageFromPath(hashToPath(hash)));
                    const addons = {
                        javascript: () => import('https://cdn.jsdelivr.net/npm/@codemirror/lang-javascript@6.1.1/dist/index.min.js'),
                        html: () => import('https://cdn.jsdelivr.net/npm/@codemirror/lang-html@6.4.1/dist/index.min.js'),
                        css: () => import('https://cdn.jsdelivr.net/npm/@codemirror/lang-css@6.0.1/dist/index.min.js'),
                        json: () => import('https://cdn.jsdelivr.net/npm/@codemirror/lang-json@6.0.1/dist/index.min.js'),
                        markdown: () => import('https://cdn.jsdelivr.net/npm/@codemirror/lang-markdown@6.1.1/dist/index.min.js'),
                        python: () => import('https://cdn.jsdelivr.net/npm/@codemirror/lang-python@6.0.1/dist/index.min.js'),
                        shell: () => import('https://cdn.jsdelivr.net/npm/@codemirror/lang-shell@6.0.1/dist/index.min.js'),
                        sql: () => import('https://cdn.jsdelivr.net/npm/@codemirror/lang-sql@6.0.1/dist/index.min.js'),
                    };

                    const loadLanguage = async () => {
                        let langSupport = null;
                        const loader = addons[lang as keyof typeof addons];
                        if (loader) {
                            try {
                                const mod = await loader();
                                langSupport = mod.default ? mod.default() : mod();
                            } catch (e) {
                                console.warn(`Language ${lang} not supported in CodeMirror`);
                            }
                        }

                        const cm = window.CodeMirror(containerRef.current!, {
                            value: content || '',
                            lineNumbers: true,
                            theme: 'darcula',
                            mode: lang,
                            indentUnit: 4,
                            tabSize: 4,
                            indentWithTabs: false,
                            autoCloseBrackets: true,
                            matchBrackets: true,
                            ...langSupport ? { extraKeys: { 'Ctrl-S': save, 'Cmd-S': save } } : {}
                        });

                        // Adaptador para simular API de Monaco
                        const adapter = {
                            getValue: () => cm.getValue(),
                            setValue: (val: string) => cm.setValue(val),
                            onDidChangeModelContent: (cb: () => void) => cm.on('change', cb),
                            dispose: () => cm.toTextArea(),
                            getModel: () => ({ getMode: () => lang })
                        };

                        editorRef.current = adapter;
                        setEditorLoaded(true);
                    };

                    loadLanguage();
                };
                document.head.appendChild(script);
            };

            loadCodeMirror();
        } else {
            // === Cargar Monaco Editor ===
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
            script.onload = () => {
                window.require.config({
                    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
                });
                window.require(['vs/editor/editor.main'], () => {
                    setEditorLoaded(true);
                });
            };
            document.head.appendChild(script);
        }

        return () => {
            if (editorRef.current && editorRef.current.dispose) {
                editorRef.current.dispose();
            }
        };
    }, [isMobile, editorLoaded]);

    // Inicializar editor cuando esté cargado
    useEffect(() => {
        if (!editorLoaded || !containerRef.current || editorRef.current) return;

        const initialContent = action === 'new' ? '' : content;
        const languageId = getLanguageId(lang);

        if (isMobile) {
            // Ya se inicializó en el paso anterior
            return;
        }

        // Monaco para escritorio
        editorRef.current = window.monaco.editor.create(containerRef.current, {
            value: initialContent,
            language: languageId,
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: 'on',
            scrollBeyondLastLine: false
        });

        editorRef.current.onDidChangeModelContent(() => {
            setContent(editorRef.current.getValue());
        });
    }, [editorLoaded, content, lang, action, isMobile]);

    // Actualizar idioma
    useEffect(() => {
        if (!editorRef.current || !editorLoaded) return;

        const languageId = getLanguageId(lang);
        if (isMobile) {
            // CodeMirror no cambia de modo fácilmente, recargar
            save();
            window.location.reload();
        } else if (window.monaco) {
            const model = editorRef.current.getModel();
            window.monaco.editor.setModelLanguage(model, languageId);
        }
    }, [lang, editorLoaded, isMobile]);

    // Atajos de teclado
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                action === 'edit' ? save() : setModalVisible(true);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [action, save]);

    // Sincronizar contenido
    useEffect(() => {
        if (editorRef.current && content !== editorRef.current.getValue()) {
            editorRef.current.setValue(content);
        }
    }, [content]);

    return (
        <>
            <FileNameModal
                visible={modalVisible}
                onDismissed={() => setModalVisible(false)}
                onFileNamed={(name) => {
                    setModalVisible(false);
                    setLang(detectLanguageFromPath(name));
                    save(name);
                }}
            />

            <div style={{ position: 'relative', height: '60vh', minHeight: '300px', marginTop: '0.5rem' }}>
                <SpinnerOverlay visible={loading} />
                <div
                    ref={containerRef}
                    style={{
                        height: '100%',
                        borderRadius: 'var(--borderRadius)',
                        overflow: 'hidden',
                        border: '1px solid #333'
                    }}
                />
            </div>

            <div className="responsive-button-group">
                <div className="responsive-button">
                    <Select value={lang} onChange={e => setLang(e.target.value)}>
                        {modes.map(mode => (
                            <option key={`${mode.name}_${mode.mime}`} value={mode.mime}>
                                {mode.name}
                            </option>
                        ))}
                    </Select>
                </div>

                {action === 'edit' ? (
                    <Can action="file.update">
                        <Button className="responsive-button" onClick={save}>
                            Save Content
                        </Button>
                    </Can>
                ) : (
                    <Can action="file.create">
                        <Button className="responsive-button" onClick={() => setModalVisible(true)}>
                            Create File
                        </Button>
                    </Can>
                )}
            </div>
        </>
    );
};

export default Editor;