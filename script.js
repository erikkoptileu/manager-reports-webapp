// Manager Reports Web App JavaScript
// Handles form validation, progress tracking, localStorage, and Telegram Web App integration

class ManagerReportApp {
    constructor() {
        this.form = document.getElementById('reportForm');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.submitBtn = document.getElementById('submitBtn');
        this.successMessage = document.getElementById('successMessage');
        
        this.totalQuestions = 11;
        this.completedQuestions = 0;
        this.formData = {};
        this.uploadedFiles = [];
        
        this.init();
    }
    
    init() {
        this.setupTelegramWebApp();
        this.setupEventListeners();
        this.loadStoredData();
        this.updateProgress();
        this.validateForm();
    }
    
    setupTelegramWebApp() {
        // Initialize Telegram Web App if available
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            
            // Apply Telegram theme
            document.body.classList.add('tg-viewport');
            
            // Setup main button
            tg.MainButton.text = 'Отправить отчет';
            tg.MainButton.onClick(() => {
                this.submitForm();
            });
            
            // Handle back button
            tg.BackButton.onClick(() => {
                if (this.hasUnsavedChanges()) {
                    tg.showConfirm('У вас есть несохраненные изменения. Вы уверены, что хотите выйти?', (result) => {
                        if (result) {
                            tg.close();
                        }
                    });
                } else {
                    tg.close();
                }
            });
        }
    }
    
    setupEventListeners() {
        // Form submission
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitForm();
        });
        
        // Input validation and progress tracking
        const inputs = this.form.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                this.handleInputChange(e.target);
                this.saveToLocalStorage();
            });
            
            input.addEventListener('blur', (e) => {
                this.validateField(e.target);
            });
        });
        
        // File upload handling
        const fileInput = document.getElementById('receipts');
        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target);
        });
        
        // Character count for comments
        const commentsTextarea = document.getElementById('comments');
        commentsTextarea.addEventListener('input', (e) => {
            this.updateCharacterCount(e.target);
        });
        
        // Auto-save every 30 seconds
        setInterval(() => {
            this.saveToLocalStorage();
        }, 30000);
        
        // Save before page unload
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges()) {
                this.saveToLocalStorage();
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }
    
    handleInputChange(input) {
        // Clear error state
        this.clearFieldError(input);
        
        // Validate field
        this.validateField(input);
        
        // Update progress
        this.updateProgress();
        
        // Update form validation state
        this.validateForm();
        
        // Handle special cases
        if (input.id === 'dealAmount') {
            this.formatCurrencyInput(input);
        }
        
        // Cross-validation rules
        this.applyCrossValidation(input);
    }
    
    validateField(field) {
        const value = field.value.trim();
        const isRequired = field.hasAttribute('required');
        let isValid = true;
        let errorMessage = '';
        
        // Required field validation
        if (isRequired && (!value || value === '')) {
            if (field.type === 'file' && this.uploadedFiles.length === 0) {
                isValid = false;
                errorMessage = 'Необходимо загрузить хотя бы один файл';
            } else if (field.type !== 'file') {
                isValid = false;
                errorMessage = 'Это поле обязательно для заполнения';
            }
        }
        
        // Type-specific validation
        if (value && field.type === 'number') {
            const numValue = parseFloat(value);
            if (isNaN(numValue) || numValue < 0) {
                isValid = false;
                errorMessage = 'Введите корректное положительное число';
            }
            
            // Special validation for specific fields
            if (field.id === 'leadsToDeals' || field.id === 'lostLeads') {
                const newLeads = parseFloat(document.getElementById('newLeads').value) || 0;
                if (numValue > newLeads && newLeads > 0) {
                    isValid = false;
                    errorMessage = 'Не может быть больше общего количества новых лидов';
                }
            }
        }
        
        // Comments validation
        if (field.id === 'comments' && value.length > 500) {
            isValid = false;
            errorMessage = 'Комментарий не должен превышать 500 символов';
        }
        
        // Apply validation state
        if (isValid) {
            field.classList.remove('error');
            field.classList.add('valid');
            this.clearFieldError(field);
        } else {
            field.classList.remove('valid');
            field.classList.add('error');
            this.showFieldError(field, errorMessage);
        }
        
        return isValid;
    }
    
    applyCrossValidation(changedField) {
        // Validate interdependent fields
        if (changedField.id === 'newLeads') {
            this.validateField(document.getElementById('leadsToDeals'));
            this.validateField(document.getElementById('lostLeads'));
        }
        
        if (changedField.id === 'closedDeals') {
            const dealAmount = document.getElementById('dealAmount');
            const closedDeals = parseInt(changedField.value) || 0;
            
            if (closedDeals > 0 && !dealAmount.value) {
                this.showFieldError(dealAmount, 'При наличии закрытых сделок необходимо указать сумму');
            }
        }
    }
    
    showFieldError(field, message) {
        const errorElement = document.getElementById(field.id + '-error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
        }
    }
    
    clearFieldError(field) {
        const errorElement = document.getElementById(field.id + '-error');
        if (errorElement) {
            errorElement.classList.remove('show');
            errorElement.textContent = '';
        }
    }
    
    formatCurrencyInput(input) {
        let value = input.value.replace(/[^\d.]/g, '');
        const parts = value.split('.');
        if (parts.length > 2) {
            value = parts[0] + '.' + parts.slice(1).join('');
        }
        if (parts[1] && parts[1].length > 2) {
            value = parts[0] + '.' + parts[1].substring(0, 2);
        }
        input.value = value;
    }
    
    handleFileUpload(input) {
        const files = Array.from(input.files);
        const uploadedFilesContainer = document.getElementById('uploadedFiles');
        
        // Clear previous files display
        uploadedFilesContainer.innerHTML = '';
        this.uploadedFiles = [];
        
        files.forEach((file, index) => {
            // Validate file type
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
            if (!validTypes.includes(file.type)) {
                this.showFieldError(input, 'Поддерживаются только изображения (JPEG, PNG, GIF) и PDF файлы');
                return;
            }
            
            // Validate file size (max 10MB)
            const maxSize = 10 * 1024 * 1024;
            if (file.size > maxSize) {
                this.showFieldError(input, 'Размер файла не должен превышать 10MB');
                return;
            }
            
            this.uploadedFiles.push(file);
            
            // Create file display element
            const fileElement = document.createElement('div');
            fileElement.className = 'uploaded-file';
            fileElement.innerHTML = `
                <span>📄</span>
                <span>${file.name} (${this.formatFileSize(file.size)})</span>
                <button type="button" class="remove-file" onclick="app.removeFile(${index})">✕</button>
            `;
            
            uploadedFilesContainer.appendChild(fileElement);
        });
        
        // Clear any previous errors if files are valid
        if (this.uploadedFiles.length > 0) {
            this.clearFieldError(input);
            input.classList.remove('error');
            input.classList.add('valid');
        }
        
        this.updateProgress();
        this.validateForm();
        this.saveToLocalStorage();
    }
    
    removeFile(index) {
        this.uploadedFiles.splice(index, 1);
        
        // Update file input
        const fileInput = document.getElementById('receipts');
        const dt = new DataTransfer();
        this.uploadedFiles.forEach(file => dt.items.add(file));
        fileInput.files = dt.files;
        
        // Refresh display
        this.handleFileUpload(fileInput);
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    updateCharacterCount(textarea) {
        const count = textarea.value.length;
        const counter = document.getElementById('commentCount');
        counter.textContent = count;
        
        if (count > 500) {
            counter.style.color = 'var(--tg-error)';
            textarea.classList.add('error');
        } else {
            counter.style.color = 'var(--text-muted)';
            textarea.classList.remove('error');
        }
    }
    
    updateProgress() {
        let completed = 0;
        
        // Check required number inputs
        const requiredNumbers = ['newLeads', 'leadsToDeals', 'lostLeads', 'activeChats', 
                                'transferredClients', 'closedDeals', 'dealAmount', 
                                'shippedOrders', 'paidOrders'];
        
        requiredNumbers.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field && field.value.trim() !== '' && !field.classList.contains('error')) {
                completed++;
            }
        });
        
        // Check file upload
        if (this.uploadedFiles.length > 0) {
            completed++;
        }
        
        // Comments are optional, but count if filled
        const comments = document.getElementById('comments');
        if (comments && comments.value.trim() !== '') {
            completed++;
        } else {
            completed++; // Comments are optional, so always count as completed
        }
        
        this.completedQuestions = completed;
        const percentage = (completed / this.totalQuestions) * 100;
        
        this.progressFill.style.width = `${percentage}%`;
        this.progressText.textContent = `${completed} из ${this.totalQuestions} вопросов`;
        
        // Update Telegram Web App main button
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            if (completed === this.totalQuestions) {
                tg.MainButton.show();
                tg.MainButton.enable();
            } else {
                tg.MainButton.hide();
            }
        }
    }
    
    validateForm() {
        let isValid = true;
        const requiredFields = this.form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            if (field.type === 'file') {
                if (this.uploadedFiles.length === 0) {
                    isValid = false;
                }
            } else if (!field.value.trim() || field.classList.contains('error')) {
                isValid = false;
            }
        });
        
        this.submitBtn.disabled = !isValid;
        
        if (isValid) {
            this.submitBtn.classList.remove('disabled');
        } else {
            this.submitBtn.classList.add('disabled');
        }
        
        return isValid;
    }
    
    async submitForm() {
        if (!this.validateForm()) {
            this.showNotification('Пожалуйста, заполните все обязательные поля', 'error');
            return;
        }
        
        // Show loading state
        this.submitBtn.classList.add('loading');
        this.submitBtn.querySelector('.btn-text').style.opacity = '0';
        this.submitBtn.querySelector('.btn-loader').classList.remove('hidden');
        
        try {
            // Collect form data
            const formData = new FormData(this.form);
            
            // Add uploaded files
            this.uploadedFiles.forEach((file, index) => {
                formData.append(`receipt_${index}`, file);
            });
            
            // Simulate API call (replace with actual endpoint)
            await this.simulateSubmission(formData);
            
            // Show success
            this.showSuccess();
            
            // Clear localStorage
            this.clearStoredData();
            
            // Close Telegram Web App after delay
            if (window.Telegram && window.Telegram.WebApp) {
                setTimeout(() => {
                    window.Telegram.WebApp.close();
                }, 3000);
            }
            
        } catch (error) {
            console.error('Submission error:', error);
            this.showNotification('Произошла ошибка при отправке отчета. Попробуйте еще раз.', 'error');
            
            // Reset button state
            this.submitBtn.classList.remove('loading');
            this.submitBtn.querySelector('.btn-text').style.opacity = '1';
            this.submitBtn.querySelector('.btn-loader').classList.add('hidden');
        }
    }
    
    async simulateSubmission(formData) {
        // Simulate API delay
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log('Form data submitted:', Object.fromEntries(formData));
                resolve();
            }, 2000);
        });
    }
    
    showSuccess() {
        // Hide form
        this.form.classList.add('fade-out');
        
        setTimeout(() => {
            this.form.classList.add('hidden');
            this.successMessage.classList.remove('hidden');
            this.successMessage.classList.add('show');
            
            // Hide progress bar
            document.querySelector('.progress-container').classList.add('hidden');
        }, 300);
    }
    
    showNotification(message, type = 'info') {
        // Use Telegram Web App notification if available
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.showAlert(message);
            return;
        }
        
        // Fallback to custom notification
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? 'var(--tg-error)' : 'var(--tg-success)'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: var(--box-shadow-lg);
            z-index: 1000;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
    
    saveToLocalStorage() {
        const formData = {};
        const inputs = this.form.querySelectorAll('input:not([type="file"]), textarea');
        
        inputs.forEach(input => {
            formData[input.id] = input.value;
        });
        
        // Store file names (not the actual files for security)
        formData.uploadedFileNames = this.uploadedFiles.map(file => file.name);
        
        localStorage.setItem('managerReportData', JSON.stringify(formData));
    }
    
    loadStoredData() {
        const storedData = localStorage.getItem('managerReportData');
        if (!storedData) return;
        
        try {
            const data = JSON.parse(storedData);
            
            // Restore form values
            Object.keys(data).forEach(key => {
                if (key === 'uploadedFileNames') return;
                
                const field = document.getElementById(key);
                if (field) {
                    field.value = data[key];
                    this.validateField(field);
                }
            });
            
            // Update character count for comments
            const comments = document.getElementById('comments');
            if (comments && comments.value) {
                this.updateCharacterCount(comments);
            }
            
            this.updateProgress();
            this.validateForm();
            
        } catch (error) {
            console.error('Error loading stored data:', error);
        }
    }
    
    clearStoredData() {
        localStorage.removeItem('managerReportData');
    }
    
    hasUnsavedChanges() {
        const inputs = this.form.querySelectorAll('input:not([type="file"]), textarea');
        return Array.from(inputs).some(input => input.value.trim() !== '') || 
               this.uploadedFiles.length > 0;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ManagerReportApp();
});

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);