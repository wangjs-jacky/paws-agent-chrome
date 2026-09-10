document.querySelector('#route-change')?.addEventListener('click', () => { history.pushState({}, '', '?route=second#conversation'); document.querySelector('#route-status').textContent = location.search + location.hash; });
document.querySelector('#route-restore')?.addEventListener('click', () => { history.pushState({}, '', '/'); document.querySelector('#route-status').textContent = '/'; });
document.querySelector('#send-failure')?.addEventListener('click', () => { void fetch('/__fixture-control', { method: 'POST', body: JSON.stringify({ failNextSend: true }) }); });
document.querySelector('#storage-failure')?.addEventListener('click', () => { void fetch('/__fixture-control', { method: 'POST', body: JSON.stringify({ failStorage: true }) }); });
document.querySelector('#storage-restore')?.addEventListener('click', () => { void fetch('/__fixture-control', { method: 'POST', body: JSON.stringify({ failStorage: false }) }); });
