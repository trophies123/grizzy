// Erafox WebVM - v86-based x86 эмулятор в браузере
// Никакого сервера, всё локально в браузере пользователя

class ErafoxWebVM {
    constructor() {
        this.vm = null;
        this.isRunning = false;
        this.isoFile = null;
        this.diskImage = null;
        this.vgaCanvas = document.getElementById('vgaCanvas');
        this.statusDiv = document.getElementById('status');
        this.logDiv = document.getElementById('log');
        
        this.initEventListeners();
        this.createEmptyDisk();
        this.addLog('Система готова. Выберите ISO и нажмите "Запустить ВМ"');
    }
    
    addLog(msg) {
        const entry = document.createElement('div');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        this.logDiv.appendChild(entry);
        this.logDiv.scrollTop = this.logDiv.scrollHeight;
    }
    
    updateStatus(text, isError = false) {
        this.statusDiv.textContent = text;
        this.statusDiv.style.color = isError ? '#d63031' : '#4ecdc4';
    }
    
    async createEmptyDisk() {
        const diskSize = parseInt(document.getElementById('diskSize').value) * 1024 * 1024; // MB to bytes
        this.addLog(`Создание виртуального диска размером ${diskSize / (1024*1024)} MB...`);
        
        // Создаём пустой образ диска в памяти
        this.diskImage = new Uint8Array(diskSize);
        // Заполняем нулями (уже по умолчанию)
        this.addLog('Виртуальный диск готов');
    }
    
    initEventListeners() {
        // Загрузка ISO
        const uploadBtn = document.getElementById('uploadBtn');
        const isoUpload = document.getElementById('isoUpload');
        const uploadArea = document.getElementById('uploadArea');
        
        uploadBtn.onclick = () => isoUpload.click();
        
        isoUpload.onchange = (e) => {
            const file = e.target.files[0];
            if (file && (file.name.endsWith('.iso') || file.name.endsWith('.img') || file.name.endsWith('.bin'))) {
                this.isoFile = file;
                document.getElementById('isoInfo').innerHTML = `✅ ${file.name}<br>${(file.size / (1024*1024)).toFixed(2)} MB`;
                this.addLog(`Загружен ISO: ${file.name} (${(file.size / (1024*1024)).toFixed(2)} MB)`);
            } else {
                alert('Пожалуйста, выберите файл .iso, .img или .bin');
            }
        };
        
        // Кнопки управления
        document.getElementById('startBtn').onclick = () => this.startVM();
        document.getElementById('stopBtn').onclick = () => this.stopVM();
        document.getElementById('resetBtn').onclick = () => this.resetVM();
        document.getElementById('fullscreenBtn').onclick = () => this.fullscreen();
        document.getElementById('ctrlAltDel').onclick = () => this.sendKeys([{ctrl: true, alt: true, code: 'Delete'}]);
        document.getElementById('sendEsc').onclick = () => this.sendKeys([{code: 'Escape'}]);
        document.getElementById('sendTab').onclick = () => this.sendKeys([{code: 'Tab'}]);
        
        // Настройки RAM
        const ramSlider = document.getElementById('ramSlider');
        const ramValue = document.getElementById('ramValue');
        ramSlider.oninput = () => {
            ramValue.textContent = ramSlider.value;
        };
        
        // Пересоздание диска при изменении размера (если ВМ не запущена)
        document.getElementById('diskSize').onchange = () => {
            if (!this.isRunning) {
                this.createEmptyDisk();
            } else {
                this.addLog('Предупреждение: изменение размера диска возможно только до запуска ВМ');
            }
        };
        
        // Фокус на canvas для клавиатуры
        this.vgaCanvas.addEventListener('click', () => {
            this.vgaCanvas.focus();
            this.addLog('Клик захвачен, клавиатура направляется в ВМ');
        });
        
        // Делаем canvas focusable
        this.vgaCanvas.setAttribute('tabindex', '0');
        this.vgaCanvas.style.outline = 'none';
    }
    
    sendKeys(keys) {
        if (!this.vm || !this.isRunning) return;
        // Эмуляция нажатий клавиш через v86 API
        keys.forEach(key => {
            if (key.ctrl || key.alt) {
                // Сложные комбинации - упрощённо
                this.vm.keyboard_send_event(key.code);
            } else {
                this.vm.keyboard_send_event(key.code);
            }
        });
        this.addLog(`Отправлена комбинация клавиш`);
    }
    
    async startVM() {
        if (this.isRunning) {
            this.addLog('ВМ уже запущена');
            return;
        }
        
        if (!this.isoFile) {
            alert('Пожалуйста, сначала загрузите ISO-образ операционной системы');
            return;
        }
        
        this.updateStatus('Загрузка ВМ...');
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('resetBtn').disabled = false;
        document.getElementById('fullscreenBtn').disabled = false;
        document.getElementById('vmOverlay').classList.remove('hidden');
        
        this.addLog('Инициализация виртуальной машины...');
        
        // Читаем ISO как ArrayBuffer
        const isoArrayBuffer = await this.isoFile.arrayBuffer();
        const isoBytes = new Uint8Array(isoArrayBuffer);
        
        const ramSize = parseInt(document.getElementById('ramSlider').value);
        const cores = parseInt(document.getElementById('coresCount').value);
        
        this.addLog(`Конфигурация: ${ramSize} MB RAM, ${cores} ядра(а), диск ${this.diskImage.length / (1024*1024)} MB`);
        
        // Создаём эмулятор v86
        const v86Config = {
            memory_size: ramSize * 1024 * 1024,
            vga_memory_size: 8 * 1024 * 1024,
            screen_container: this.vgaCanvas,
            boot_order: 0x31, // CD-ROM сначала, потом диск
            cdrom: {
                buffer: isoBytes
            },
            fda: null,
            hda: {
                buffer: this.diskImage
            },
            network_relay_url: 'wss://relay.widgetry.org/',
            wasm_path: 'https://cdn.jsdelivr.net/npm/@tanishiking/v86@0.2.0/v86.wasm'
        };
        
        try {
            this.vm = new window.V86Starter(v86Config);
            
            // Обработчики событий
            this.vm.add_listener('emulator-loaded', () => {
                this.addLog('Эмулятор загружен');
            });
            
            this.vm.add_listener('screen-ready', () => {
                this.addLog('Экран готов');
            });
            
            this.vm.add_listener('serial0-output-char', (ch) => {
                // Можно логировать вывод в консоль
                // process.stdout.write(ch);
            });
            
            this.vm.add_listener('download-file', (filename, data) => {
                this.addLog(`Файл сохранен: ${filename}`);
            });
            
            this.vm.add_listener('error', (err) => {
                this.addLog(`Ошибка: ${err}`, true);
                this.updateStatus('Ошибка ВМ', true);
            });
            
            // Запуск
            await this.vm.run();
            this.isRunning = true;
            this.updateStatus('ВМ запущена — загрузка ОС с ISO...');
            this.addLog('Виртуальная машина запущена');
            
            setTimeout(() => {
                document.getElementById('vmOverlay').classList.add('hidden');
            }, 2000);
            
        } catch (err) {
            this.addLog(`Критическая ошибка: ${err.message}`, true);
            this.updateStatus('Ошибка запуска', true);
            this.stopVM();
        }
    }
    
    stopVM() {
        if (this.vm && this.isRunning) {
            this.addLog('Остановка виртуальной машины...');
            this.vm.stop();
            this.isRunning = false;
            this.vm = null;
            this.updateStatus('Остановлена');
        }
        
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('resetBtn').disabled = true;
        document.getElementById('fullscreenBtn').disabled = true;
        document.getElementById('vmOverlay').classList.add('hidden');
        this.addLog('ВМ остановлена');
    }
    
    resetVM() {
        if (this.vm && this.isRunning) {
            this.addLog('Перезагрузка ВМ...');
            this.vm.restart();
            this.updateStatus('Перезагрузка...');
        }
    }
    
    fullscreen() {
        const container = document.querySelector('.vm-container');
        if (container.requestFullscreen) {
            container.requestFullscreen();
            this.addLog('Полноэкранный режим активирован');
        }
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    window.erafoxVM = new ErafoxWebVM();
});