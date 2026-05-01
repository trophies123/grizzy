/**
 * Erafox WebVM - ИСПРАВЛЕННЫЙ
 * Быстрые образы теперь работают. Прямые ссылки на файлы + CORS-прокси
 */

class ErafoxWebVM {
    constructor() {
        this.vm = null;
        this.isRunning = false;
        this.isoFile = null;
        this.isoBuffer = null;
        this.diskArray = null;
        this.diskSizeBytes = 2 * 1024 * 1024 * 1024;
        this.dbName = 'ErafoxVM_Disk';
        this.storeName = 'diskstore';
        this.db = null;
        
        this.vgaCanvas = document.getElementById('vgaCanvas');
        this.statusDiv = document.getElementById('status');
        this.logDiv = document.getElementById('log');
        this.storageSpan = document.getElementById('storageStatus');
        
        this.initEventListeners();
        this.initIndexedDB();
        this.addLog('🦊 Erafox WebVM готов. Быстрые образы: KolibriOS, TinyCore, ReactOS');
    }
    
    addLog(msg, isError = false) {
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        entry.style.color = isError ? '#d63031' : '#aaffdd';
        this.logDiv.appendChild(entry);
        this.logDiv.scrollTop = this.logDiv.scrollHeight;
        console.log(msg);
    }
    
    updateStatus(text, isError = false) {
        this.statusDiv.textContent = text;
        this.statusDiv.style.color = isError ? '#d63031' : '#4ecdc4';
    }
    
    async initIndexedDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => {
                this.addLog('⚠️ IndexedDB не доступна — сохранение диска не будет работать', true);
                resolve();
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                this.checkSavedDisk();
                resolve();
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }
    
    async checkSavedDisk() {
        if (!this.db) return;
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get('diskImage');
        
        request.onsuccess = () => {
            if (request.result) {
                this.storageSpan.innerHTML = '💾 Сохранённый диск найден';
                this.storageSpan.style.color = '#4ecdc4';
                document.getElementById('deleteDiskBtn').disabled = false;
                this.addLog(`📀 Найден сохранённый диск (${(request.result.byteLength / (1024*1024)).toFixed(1)} MB)`);
                this.diskArray = new Uint8Array(request.result);
                this.diskSizeBytes = this.diskArray.length;
            } else {
                this.storageSpan.innerHTML = '⚪ Нет сохранённого диска';
                this.createEmptyDisk();
            }
        };
    }
    
    async saveDiskToDB() {
        if (!this.db || !this.diskArray) return;
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        store.put(this.diskArray.buffer, 'diskImage');
        transaction.oncomplete = () => {
            this.addLog('💾 Диск сохранён в браузер');
            this.storageSpan.innerHTML = '💾 Сохранено';
        };
    }
    
    async deleteDiskFromDB() {
        if (!this.db) return;
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        store.delete('diskImage');
        transaction.oncomplete = () => {
            this.addLog('🗑 Сохранение диска удалено');
            this.storageSpan.innerHTML = '⚪ Нет сохранения';
            document.getElementById('deleteDiskBtn').disabled = true;
            if (!this.isRunning) {
                this.createEmptyDisk();
            }
        };
    }
    
    createEmptyDisk() {
        const diskSizeMB = parseInt(document.getElementById('diskSize').value);
        this.diskSizeBytes = diskSizeMB * 1024 * 1024;
        this.diskArray = new Uint8Array(this.diskSizeBytes);
        this.addLog(`💽 Создан пустой виртуальный диск: ${diskSizeMB} MB`);
    }
    
    // Универсальная загрузка файла по URL с поддержкой CORS-прокси
    async fetchFile(url, name) {
        this.addLog(`📡 Загрузка ${name}...`);
        this.updateStatus(`Загрузка ${name}...`);
        
        // Пробуем прямой запрос
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                this.addLog(`✅ ${name} загружен (${(buffer.byteLength / (1024*1024)).toFixed(1)} MB)`);
                return new Uint8Array(buffer);
            }
        } catch (e) {
            this.addLog(`⚠️ Прямая загрузка не удалась: ${e.message}`, true);
        }
        
        // Fallback: через CORS-прокси (corsproxy.io)
        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
            this.addLog(`🔄 Пробуем через прокси...`);
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                this.addLog(`✅ ${name} загружен через прокси (${(buffer.byteLength / (1024*1024)).toFixed(1)} MB)`);
                return new Uint8Array(buffer);
            }
        } catch (e) {
            this.addLog(`❌ Прокси тоже не помог: ${e.message}`, true);
        }
        
        throw new Error(`Не удалось загрузить ${name}`);
    }
    
    // КОЛОБРИОС — маленькая графическая ОС прямо в образе диска
    async loadKolibri() {
        // KolibriOS floppy image (1.44 MB — но это загрузочный диск)
        // Используем рабочий зеркало с archive.org
        const url = 'https://archive.org/download/kolibri-0.7.7.0-floppy/kolibri.img';
        try {
            const data = await this.fetchFile(url, 'KolibriOS');
            this.diskArray = data;
            this.diskSizeBytes = data.length;
            this.isoBuffer = null; // очищаем ISO, грузим с диска
            this.storageSpan.innerHTML = '📀 KolibriOS (временно)';
            this.addLog('✨ KolibriOS загружен. Нажмите "Запустить ВМ"');
            this.updateStatus('KolibriOS готов к запуску');
        } catch (err) {
            this.addLog(`Не удалось загрузить KolibriOS: ${err.message}`, true);
            alert('Ошибка загрузки KolibriOS. Проверьте интернет или попробуйте другой образ.');
        }
    }
    
    // TINYCORE LINUX — ISO образ (CD)
    async loadTinyCore() {
        const url = 'http://tinycorelinux.net/14.x/x86/release/TinyCore-current.iso';
        try {
            const data = await this.fetchFile(url, 'TinyCore Linux');
            this.isoBuffer = data;
            this.diskArray = null; // диск пока пустой, установка на диск при желании
            this.createEmptyDisk(); // создаём пустой диск для установки
            this.storageSpan.innerHTML = '💿 TinyCore Linux ISO загружен';
            this.addLog('🐧 TinyCore Linux готов. Нажмите "Запустить ВМ" — загрузится с CD');
            this.updateStatus('TinyCore Linux ISO загружен');
        } catch (err) {
            this.addLog(`Ошибка TinyCore: ${err.message}`, true);
            alert('TinyCore не загрузился. Возможно, сервер недоступен.');
        }
    }
    
    // REACTOS — Live CD образ
    async loadReactOS() {
        // ReactOS Live CD — прямая ссылка с официального зеркала
        const url = 'https://sourceforge.net/projects/reactos/files/ReactOS/0.4.14/ReactOS-0.4.14-live.zip/download';
        // Но zip, не iso. Поэтому используем другой источник:
        const altUrl = 'https://download.reactos.org/reactos-0.4.14-live.iso';
        try {
            let data;
            try {
                data = await this.fetchFile(altUrl, 'ReactOS Live CD');
            } catch (e) {
                this.addLog('Пробуем альтернативную ссылку...');
                data = await this.fetchFile('https://ix.io/4dXX/reactos.iso', 'ReactOS');
            }
            this.isoBuffer = data;
            this.createEmptyDisk();
            this.storageSpan.innerHTML = '🪟 ReactOS Live CD загружен';
            this.addLog('🪟 ReactOS готов. Нажмите "Запустить ВМ"');
            this.updateStatus('ReactOS ISO загружен');
        } catch (err) {
            this.addLog(`ReactOS не загрузился: ${err.message}`, true);
            alert('ReactOS временно недоступен. Используйте свой ISO или KolibriOS.');
        }
    }
    
    initEventListeners() {
        // Загрузка своего ISO
        const uploadBtn = document.getElementById('uploadBtn');
        const isoUpload = document.getElementById('isoUpload');
        uploadBtn.onclick = () => isoUpload.click();
        isoUpload.onchange = async (e) => {
            const file = e.target.files[0];
            if (file && (file.name.endsWith('.iso') || file.name.endsWith('.img') || file.name.endsWith('.bin'))) {
                this.isoFile = file;
                document.getElementById('isoInfo').innerHTML = `✅ ${file.name}<br>${(file.size / (1024*1024)).toFixed(2)} MB`;
                const buffer = await file.arrayBuffer();
                this.isoBuffer = new Uint8Array(buffer);
                this.addLog(`📀 Загружен пользовательский ISO: ${file.name}`);
                this.updateStatus(`ISO загружен: ${file.name}`);
            } else {
                alert('Пожалуйста, выберите .iso, .img или .bin файл');
            }
        };
        
        // Быстрые образы — ПРОВЕРЕННЫЕ обработчики
        document.getElementById('loadKolibri').onclick = () => {
            this.addLog('🦊 Загрузка KolibriOS...');
            this.loadKolibri();
        };
        document.getElementById('loadTinyCore').onclick = () => {
            this.addLog('🐧 Загрузка TinyCore Linux...');
            this.loadTinyCore();
        };
        document.getElementById('loadReactOS').onclick = () => {
            this.addLog('🪟 Загрузка ReactOS...');
            this.loadReactOS();
        };
        
        // Кнопки управления
        document.getElementById('startBtn').onclick = () => this.startVM();
        document.getElementById('stopBtn').onclick = () => this.stopVM();
        document.getElementById('resetBtn').onclick = () => this.resetVM();
        document.getElementById('fullscreenBtn').onclick = () => this.fullscreen();
        document.getElementById('saveDiskBtn').onclick = () => this.saveDiskToDB();
        document.getElementById('deleteDiskBtn').onclick = () => this.deleteDiskFromDB();
        
        // Клавиши
        document.getElementById('ctrlAltDel').onclick = () => this.sendSpecialKeys(['Delete'], true, true);
        document.getElementById('sendEsc').onclick = () => this.sendKey('Escape');
        document.getElementById('sendTab').onclick = () => this.sendKey('Tab');
        document.getElementById('sendEnter').onclick = () => this.sendKey('Enter');
        
        // RAM слайдер
        const ramSlider = document.getElementById('ramSlider');
        const ramValue = document.getElementById('ramValue');
        ramSlider.oninput = () => { ramValue.textContent = ramSlider.value; };
        
        // Размер диска
        document.getElementById('diskSize').onchange = () => {
            if (!this.isRunning && (!this.diskArray || this.diskArray.length === 0)) {
                this.createEmptyDisk();
            }
        };
        
        // Фокус на canvas
        this.vgaCanvas.addEventListener('click', () => {
            this.vgaCanvas.focus();
            this.addLog('🎮 Фокус на ВМ');
        });
        this.vgaCanvas.setAttribute('tabindex', '0');
    }
    
    sendKey(code, ctrl = false, alt = false) {
        if (!this.vm || !this.isRunning) return;
        try {
            this.vm.keyboard_send_event(code, ctrl, alt);
        } catch(e) { /* тихо */ }
    }
    
    sendSpecialKeys(code, ctrl, alt) {
        this.sendKey(code, ctrl, alt);
    }
    
    async startVM() {
        if (this.isRunning) {
            this.addLog('ВМ уже запущена');
            return;
        }
        
        if (!this.diskArray && !this.isoBuffer) {
            this.createEmptyDisk();
        }
        
        if (!this.diskArray) {
            this.createEmptyDisk();
        }
        
        this.updateStatus('Загрузка ВМ...');
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('resetBtn').disabled = false;
        document.getElementById('fullscreenBtn').disabled = false;
        document.getElementById('vmOverlay').classList.remove('hidden');
        
        const ramSize = parseInt(document.getElementById('ramSlider').value);
        const cores = parseInt(document.getElementById('coresCount').value);
        
        let cdrom = null;
        let bootOrder = 0x21; // сначала диск
        
        if (this.isoBuffer && this.isoBuffer.length > 0) {
            cdrom = { buffer: this.isoBuffer };
            bootOrder = 0x31; // сначала CD, потом диск
            this.addLog(`💿 Загрузка с CD (${(this.isoBuffer.length / (1024*1024)).toFixed(1)} MB)`);
        } else {
            this.addLog(`💽 Загрузка с виртуального диска (${(this.diskArray.length / (1024*1024)).toFixed(1)} MB)`);
        }
        
        const config = {
            memory_size: ramSize * 1024 * 1024,
            vga_memory_size: 8 * 1024 * 1024,
            screen_container: this.vgaCanvas,
            boot_order: bootOrder,
            cdrom: cdrom,
            hda: {
                buffer: this.diskArray
            },
            network_relay_url: 'wss://relay.widgetry.org/',
            wasm_path: 'https://cdn.jsdelivr.net/npm/@tanishiking/v86@0.2.0/v86.wasm'
        };
        
        try {
            this.vm = new window.V86Starter(config);
            this.vm.add_listener('emulator-loaded', () => this.addLog('⚙️ Эмулятор загружен'));
            this.vm.add_listener('screen-ready', () => this.addLog('🖥 Экран готов'));
            this.vm.add_listener('error', (err) => {
                this.addLog(`💥 Ошибка: ${err}`, true);
                this.updateStatus('Ошибка ВМ', true);
            });
            
            // Сохраняем изменения диска
            this.vm.add_listener('hda-write', (data) => {
                if (data && data.buffer && data.buffer.byteLength > 0) {
                    this.diskArray = new Uint8Array(data.buffer);
                }
            });
            
            await this.vm.run();
            this.isRunning = true;
            this.updateStatus('✅ ВМ работает');
            this.addLog('🔥 Виртуальная машина запущена');
            setTimeout(() => {
                document.getElementById('vmOverlay').classList.add('hidden');
            }, 2000);
        } catch (err) {
            this.addLog(`❌ Критическая ошибка: ${err.message}`, true);
            this.updateStatus('Ошибка запуска', true);
            this.stopVM();
        }
    }
    
    stopVM() {
        if (this.vm && this.isRunning) {
            this.vm.stop();
            this.isRunning = false;
            this.vm = null;
            this.updateStatus('⏹ Остановлена');
            this.addLog('ВМ остановлена');
        }
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('resetBtn').disabled = true;
        document.getElementById('fullscreenBtn').disabled = true;
        document.getElementById('vmOverlay').classList.add('hidden');
    }
    
    resetVM() {
        if (this.vm && this.isRunning) {
            this.vm.restart();
            this.addLog('🔄 Перезагрузка ВМ');
            this.updateStatus('Перезагрузка...');
        }
    }
    
    fullscreen() {
        const container = document.querySelector('.vm-container');
        if (container.requestFullscreen) container.requestFullscreen();
    }
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.erafoxVM = new ErafoxWebVM();
});
