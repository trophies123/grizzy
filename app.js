/**
 * Erafox WebVM - Полноценная виртуальная машина в браузере
 * Поддержка сохранения диска в IndexedDB, быстрых образов, загрузки ISO
 */

class ErafoxWebVM {
    constructor() {
        this.vm = null;
        this.isRunning = false;
        this.isoFile = null;
        this.diskArray = null;
        this.diskSizeBytes = 2 * 1024 * 1024 * 1024; // 2 GB по умолчанию
        this.dbName = 'ErafoxVM_Disk';
        this.storeName = 'diskstore';
        this.db = null;
        
        this.vgaCanvas = document.getElementById('vgaCanvas');
        this.statusDiv = document.getElementById('status');
        this.logDiv = document.getElementById('log');
        this.storageSpan = document.getElementById('storageStatus');
        
        this.initEventListeners();
        this.initIndexedDB();
        this.addLog('🦊 Erafox WebVM готов. Выберите образ или загрузите свой ISO.');
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
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => {
                this.addLog('❌ IndexedDB не доступна — сохранение диска не будет работать', true);
                reject();
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
    
    async loadBuiltinImage(url, name) {
        this.addLog(`📥 Загрузка образа ${name}...`);
        this.updateStatus(`Загрузка ${name}...`);
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            this.diskArray = new Uint8Array(buffer);
            this.diskSizeBytes = this.diskArray.length;
            this.addLog(`✅ Образ ${name} загружен (${(this.diskSizeBytes / (1024*1024)).toFixed(1)} MB)`);
            this.storageSpan.innerHTML = `📀 ${name} (временно)`;
            // Не сохраняем автоматически — пользователь сам решит
        } catch (err) {
            this.addLog(`Ошибка загрузки ${name}: ${err.message}`, true);
        }
    }
    
    async loadKolibri() {
        await this.loadBuiltinImage('https://archive.org/download/kolibrios-0.7.7.0/kolibri.img', 'KolibriOS');
    }
    
    async loadTinyCore() {
        // TinyCore Linux CD image (~18 MB)
        await this.loadBuiltinImage('http://tinycorelinux.net/14.x/x86/release/TinyCore-current.iso', 'TinyCore Linux');
        this.isoFile = { name: 'TinyCore-current.iso', arrayBuffer: async () => this.diskArray.buffer };
    }
    
    async loadReactOS() {
        // ReactOS Live CD (~70 MB)
        await this.loadBuiltinImage('https://sourceforge.net/projects/reactos/files/latest/download', 'ReactOS Live');
    }
    
    initEventListeners() {
        // Загрузка ISO
        const uploadBtn = document.getElementById('uploadBtn');
        const isoUpload = document.getElementById('isoUpload');
        uploadBtn.onclick = () => isoUpload.click();
        isoUpload.onchange = async (e) => {
            const file = e.target.files[0];
            if (file && (file.name.endsWith('.iso') || file.name.endsWith('.img'))) {
                this.isoFile = file;
                document.getElementById('isoInfo').innerHTML = `✅ ${file.name}<br>${(file.size / (1024*1024)).toFixed(2)} MB`;
                this.addLog(`Загружен ISO: ${file.name}`);
                // Считываем в память для быстрого доступа
                const buffer = await file.arrayBuffer();
                this.isoBuffer = new Uint8Array(buffer);
            } else {
                alert('Нужен .iso или .img файл');
            }
        };
        
        // Быстрые образы
        document.getElementById('loadKolibri').onclick = () => this.loadKolibri();
        document.getElementById('loadTinyCore').onclick = () => this.loadTinyCore();
        document.getElementById('loadReactOS').onclick = () => this.loadReactOS();
        
        // Кнопки управления
        document.getElementById('startBtn').onclick = () => this.startVM();
        document.getElementById('stopBtn').onclick = () => this.stopVM();
        document.getElementById('resetBtn').onclick = () => this.resetVM();
        document.getElementById('fullscreenBtn').onclick = () => this.fullscreen();
        document.getElementById('saveDiskBtn').onclick = () => this.saveDiskToDB();
        document.getElementById('deleteDiskBtn').onclick = () => this.deleteDiskFromDB();
        
        // Клавиши для ВМ
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
            if (!this.isRunning && !this.diskArray?.byteLength) {
                this.createEmptyDisk();
            }
        };
        
        // Фокус на canvas
        this.vgaCanvas.addEventListener('click', () => {
            this.vgaCanvas.focus();
            this.addLog('🎮 Фокус захвачен, клавиатура направлена в ВМ');
        });
        this.vgaCanvas.setAttribute('tabindex', '0');
        this.vgaCanvas.style.outline = 'none';
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
        if (this.isoBuffer) {
            cdrom = { buffer: this.isoBuffer };
            this.addLog(`💿 Используется ISO: ${this.isoFile?.name || 'загруженный образ'}`);
        }
        
        const config = {
            memory_size: ramSize * 1024 * 1024,
            vga_memory_size: 8 * 1024 * 1024,
            screen_container: this.vgaCanvas,
            boot_order: cdrom ? 0x31 : 0x21, // CDROM first if exists
            cdrom: cdrom,
            hda: {
                buffer: this.diskArray
            },
            network_relay_url: 'wss://relay.widgetry.org/',
            wasm_path: 'https://cdn.jsdelivr.net/npm/@tanishiking/v86@0.2.0/v86.wasm'
        };
        
        try {
            this.vm = new window.V86Starter(config);
            this.vm.add_listener('emulator-loaded', () => this.addLog('Эмулятор загружен'));
            this.vm.add_listener('screen-ready', () => this.addLog('Экран готов'));
            this.vm.add_listener('error', (err) => {
                this.addLog(`Ошибка: ${err}`, true);
                this.updateStatus('Ошибка ВМ', true);
            });
            // Сохраняем изменения диска обратно в массив
            this.vm.add_listener('hda-write', (data) => {
                if (data && data.buffer) {
                    this.diskArray = new Uint8Array(data.buffer);
                }
            });
            
            await this.vm.run();
            this.isRunning = true;
            this.updateStatus('✅ ВМ запущена');
            this.addLog('Виртуальная машина работает');
            setTimeout(() => {
                document.getElementById('vmOverlay').classList.add('hidden');
            }, 1500);
        } catch (err) {
            this.addLog(`Критическая ошибка: ${err.message}`, true);
            this.stopVM();
        }
    }
    
    stopVM() {
        if (this.vm && this.isRunning) {
            this.vm.stop();
            this.isRunning = false;
            this.vm = null;
            this.updateStatus('Остановлена');
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
            this.addLog('Перезагрузка ВМ');
        }
    }
    
    fullscreen() {
        const container = document.querySelector('.vm-container');
        if (container.requestFullscreen) container.requestFullscreen();
    }
}

// Запуск
document.addEventListener('DOMContentLoaded', () => {
    window.erafoxVM = new ErafoxWebVM();
});
