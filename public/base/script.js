document.addEventListener('DOMContentLoaded', function() {
    // Initialize charts
    initRevenueChart();
    initUserGrowthChart();
    
    // Toggle password visibility
    document.querySelectorAll('.toggle-password').forEach(function(icon) {
        icon.addEventListener('click', function() {
            const input = this.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                this.classList.remove('fa-eye');
                this.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                this.classList.remove('fa-eye-slash');
                this.classList.add('fa-eye');
            }
        });
    });
    
    // Simulate loading data
    setTimeout(function() {
        document.querySelectorAll('.summary-card').forEach(function(card) {
            card.classList.add('loaded');
        });
    }, 500);
});

function initRevenueChart() {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    const revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
            datasets: [{
                label: 'Revenue (₦)',
                data: [12000, 19000, 15000, 28000, 22000, 30000, 26000],
                backgroundColor: 'rgba(0, 91, 150, 0.1)',
                borderColor: 'rgba(0, 91, 150, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '₦' + value.toLocaleString();
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function initUserGrowthChart() {
    const ctx = document.getElementById('userGrowthChart').getContext('2d');
    const userGrowthChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
            datasets: [{
                label: 'New Users',
                data: [45, 60, 75, 90, 110, 140, 170],
                backgroundColor: 'rgba(0, 91, 150, 0.7)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Handle control form submissions
document.querySelectorAll('.control-card form').forEach(function(form) {
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        alert('Settings saved successfully!');
    });
});

// Simulate loading for controls page
if (document.querySelector('.controls-grid')) {
    setTimeout(function() {
        document.querySelectorAll('.control-card').forEach(function(card) {
            card.classList.add('loaded');
        });
    }, 500);
}