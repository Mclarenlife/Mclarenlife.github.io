document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const code = button.closest('.help-command')?.querySelector('code');
    if (!code) return;
    const status = document.querySelector('#copy-status');
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = '已复制';
      status.textContent = '命令已复制到剪贴板。';
      clearTimeout(button.resetTimer);
      button.resetTimer = setTimeout(() => { button.textContent = '复制'; }, 2000);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection?.removeAllRanges();
      selection?.addRange(range);
      status.textContent = '无法自动复制，请复制已选中的命令。';
      button.textContent = '请手动复制';
    }
  });
});
