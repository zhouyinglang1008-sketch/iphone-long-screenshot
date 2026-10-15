(() => {
  const $ = (selector) => document.querySelector(selector);
  const fileInput = $('#file-input');
  const dropzone = $('#dropzone');
  const imageList = $('#image-list');
  const previewCanvas = $('#preview-canvas');
  const previewCtx = previewCanvas.getContext('2d', { alpha: false });
  const previewEmpty = $('#preview-empty');
  const saveButton = $('#save-button');
  const autoToggle = $('#auto-overlap');
  const state = { images: [], automatic: true, toastTimer: 0, renderToken: 0 };
  const MAX_PIXELS = 16_000_000;
  const MAX_DIMENSION = 16_000;

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function prettyBytes(bytes) {
    if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  function safeName(name) {
    return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, file, url, image, overlap: 0, guessed: null });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} 无法读取`)); };
      image.src = url;
    });
  }

  async function addFiles(fileList) {
    const files = [...fileList].filter((file) => file.type.startsWith('image/'));
    if (!files.length) return toast('请选择图片格式的截图。');
    $('#save-label').textContent = '正在载入图片…';
    saveButton.disabled = true;
    const results = await Promise.allSettled(files.map(loadImage));
    const accepted = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    const failed = results.filter((result) => result.status === 'rejected');
    state.images.push(...accepted);
    if (failed.length) toast(`有 ${failed.length} 张图片无法读取，请尝试从相册重新导出。`);
    if (!accepted.length && !failed.length) toast('没有找到可用的图片。');
    fileInput.value = '';
    recomputeOverlaps();
    renderAll();
  }

  function makeSignature(img) {
    const width = 64;
    const height = Math.max(1, Math.round(img.naturalHeight * width / img.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  }

  function estimateOverlap(previous, current) {
    const a = makeSignature(previous.image);
    const b = makeSignature(current.image);
    const max = Math.floor(Math.min(a.height, b.height) * 0.56);
    const min = Math.max(5, Math.floor(Math.min(a.height, b.height) * 0.035));
    if (max <= min) return 0;
    let best = 0;
    let bestScore = Infinity;
    for (let length = min; length <= max; length++) {
      let error = 0;
      for (let row = 0; row < length; row++) {
        const ay = a.height - length + row;
        const by = row;
        for (let x = 0; x < a.width; x += 2) {
          const ai = (ay * a.width + x) * 4;
          const bi = (by * b.width + x) * 4;
          error += Math.abs(a.data[ai] - b.data[bi]);
          error += Math.abs(a.data[ai + 1] - b.data[bi + 1]);
          error += Math.abs(a.data[ai + 2] - b.data[bi + 2]);
        }
      }
      const score = error / (length * (a.width / 2) * 3);
      if (score < bestScore) { bestScore = score; best = length; }
    }
    if (bestScore > 42) return 0;
    return Math.round(best * (baseWidth() / a.width));
  }

  function recomputeOverlaps() {
    if (!state.automatic || state.images.length < 2) return;
    state.images.forEach((item, index) => {
      if (index === 0) { item.overlap = 0; item.guessed = null; return; }
      try {
        item.overlap = estimateOverlap(state.images[index - 1], item);
        item.guessed = item.overlap;
      } catch {
        item.overlap = 0;
        item.guessed = 0;
      }
    });
  }

  function baseWidth() {
    return state.images[0]?.image.naturalWidth ?? 0;
  }

  function baseHeight(item) {
    return item.image.naturalHeight * baseWidth() / item.image.naturalWidth;
  }

  function outputGeometry() {
    const width = baseWidth();
    if (!width) return { width: 0, height: 0, scale: 1 };
    let height = state.images.reduce((sum, item, index) => sum + baseHeight(item) - (index ? item.overlap : 0), 0);
    height = Math.max(1, height);
    const scale = Math.min(1, MAX_DIMENSION / width, MAX_DIMENSION / height, Math.sqrt(MAX_PIXELS / (width * height)));
    return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
  }

  function renderPreview() {
    const token = ++state.renderToken;
    if (!state.images.length) {
      previewCanvas.hidden = true;
      previewEmpty.hidden = false;
      previewEmpty.querySelector('strong').textContent = '长图会在这里出现';
      previewEmpty.querySelector('span').textContent = '导入至少两张连续截图开始拼接';
      $('#preview-meta').hidden = true;
      $('#result-summary').textContent = '';
      $('#preview-status').classList.remove('ready');
      $('#preview-status').innerHTML = '<i></i>等待图片';
      saveButton.disabled = true;
      $('#save-label').textContent = '保存长图到手机';
      return;
    }
    if (state.images.length === 1) {
      previewCanvas.hidden = true;
      previewEmpty.hidden = false;
      $('#preview-meta').hidden = true;
      previewEmpty.querySelector('strong').textContent = '再添加一张截图';
      previewEmpty.querySelector('span').textContent = '至少两张图片才能拼成一张长图';
      $('#preview-status').classList.remove('ready');
      $('#preview-status').innerHTML = '<i></i>还差一张';
      saveButton.disabled = true;
      return;
    }
    const geometry = outputGeometry();
    const previewScale = Math.min(1, 330 / geometry.width, 400 / geometry.height);
    const width = Math.max(1, Math.round(geometry.width * previewScale));
    const height = Math.max(1, Math.round(geometry.height * previewScale));
    previewCanvas.width = width;
    previewCanvas.height = height;
    let y = 0;
    state.images.forEach((item, index) => {
      if (token !== state.renderToken) return;
      const tileHeight = baseHeight(item) * geometry.scale * previewScale;
      if (index) y -= item.overlap * geometry.scale * previewScale;
      previewCtx.drawImage(item.image, 0, y, width, tileHeight);
      y += tileHeight;
    });
    previewEmpty.hidden = true;
    previewCanvas.hidden = false;
    $('#preview-status').classList.add('ready');
    $('#preview-status').innerHTML = '<i></i>预览已更新';
    $('#preview-meta').hidden = false;
    $('#output-dimensions').textContent = `${geometry.width} × ${geometry.height} px`;
    $('#output-size').textContent = geometry.scale < .999 ? `已缩放至 ${(geometry.scale * 100).toFixed(0)}%` : 'PNG 图片';
    $('#save-hint').textContent = geometry.scale < .999 ? '为适配手机内存，保存尺寸已自动缩小' : 'iPhone 会打开分享菜单，可选择“存储图像”';
    saveButton.disabled = false;
    $('#save-label').textContent = '保存长图到手机';
    $('#result-summary').textContent = `${state.images.length} 张截图 · 约 ${geometry.width.toLocaleString()} × ${geometry.height.toLocaleString()} 像素`;
  }

  function renderList() {
    imageList.replaceChildren();
    const hasImages = state.images.length > 0;
    $('#image-count').textContent = `${state.images.length} 张`;
    $('#list-heading').hidden = !hasImages;
    $('#add-more').hidden = !hasImages;
    $('#settings-panel').hidden = state.images.length < 2;
    state.images.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = 'image-card';
      const thumb = document.createElement('img');
      thumb.className = 'image-thumb';
      thumb.src = item.url;
      thumb.alt = `第 ${index + 1} 张截图缩略图`;
      const info = document.createElement('div');
      info.className = 'image-info';
      const title = document.createElement('div');
      title.className = 'image-title-row';
      const number = document.createElement('span');
      number.className = 'image-index';
      number.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'image-name';
      name.textContent = safeName(item.file.name);
      name.title = item.file.name;
      title.append(number, name);
      const dimensions = document.createElement('div');
      dimensions.className = 'image-dimensions';
      dimensions.textContent = `${item.image.naturalWidth} × ${item.image.naturalHeight} · ${prettyBytes(item.file.size)}`;
      info.append(title, dimensions);
      if (index > 0) {
        const control = document.createElement('div');
        control.className = 'overlap-control';
        const label = document.createElement('label');
        label.textContent = '重叠';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = String(Math.max(0, Math.floor(Math.min(baseHeight(item), baseHeight(state.images[index - 1])) * .72)));
        slider.step = '1';
        slider.value = String(Math.min(Number(slider.max), item.overlap));
        slider.setAttribute('aria-label', `第 ${index + 1} 张截图的重叠像素`);
        const value = document.createElement('span');
        value.className = 'overlap-value';
        value.textContent = `${slider.value}px`;
        slider.addEventListener('input', () => {
          state.automatic = false;
          autoToggle.checked = false;
          item.overlap = Number(slider.value);
          value.textContent = `${slider.value}px`;
          $('#result-summary').textContent = `${state.images.length} 张截图 · 重叠位置已调整`;
          renderPreview();
        });
        control.append(label, slider, value);
        info.append(control);
      }
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const up = makeActionButton('↑', '上移', index === 0, () => moveItem(index, -1));
      const down = makeActionButton('↓', '下移', index === state.images.length - 1, () => moveItem(index, 1));
      const remove = makeActionButton('×', '删除', false, () => removeItem(index), true);
      actions.append(up, down, remove);
      card.append(thumb, info, actions);
      imageList.append(card);
    });
  }

  function makeActionButton(text, label, disabled, action, remove = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `icon-button${remove ? ' remove' : ''}`;
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.disabled = disabled;
    if (disabled) button.style.opacity = '.35';
    button.addEventListener('click', action);
    return button;
  }

  function moveItem(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.images.length) return;
    [state.images[index], state.images[target]] = [state.images[target], state.images[index]];
    recomputeOverlaps();
    renderAll();
  }

  function removeItem(index) {
    URL.revokeObjectURL(state.images[index].url);
    state.images.splice(index, 1);
    recomputeOverlaps();
    renderAll();
  }

  function renderAll() {
    renderList();
    renderPreview();
  }

  async function exportImage() {
    if (state.images.length < 2 || saveButton.disabled) return;
    saveButton.disabled = true;
    $('#save-label').textContent = '正在生成长图…';
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const geometry = outputGeometry();
    const canvas = document.createElement('canvas');
    canvas.width = geometry.width;
    canvas.height = geometry.height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    let y = 0;
    state.images.forEach((item, index) => {
      if (index) y -= item.overlap * geometry.scale;
      const tileHeight = baseHeight(item) * geometry.scale;
      context.drawImage(item.image, 0, y, canvas.width, tileHeight);
      y += tileHeight;
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      saveButton.disabled = false;
      $('#save-label').textContent = '保存长图到手机';
      toast('图片生成失败，请减少截图数量后重试。');
      return;
    }
    const file = new File([blob], `长图工坊-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: '拼接长图' });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        toast('长图已生成；如未自动保存，请在下载项中打开图片。');
      }
    } catch (error) {
      if (error.name !== 'AbortError') toast('保存没有完成，请再试一次。');
    } finally {
      saveButton.disabled = false;
      $('#save-label').textContent = '保存长图到手机';
    }
  }

  dropzone.addEventListener('click', (event) => {
    if (event.target !== fileInput) fileInput.click();
  });
  fileInput.addEventListener('change', () => addFiles(fileInput.files));
  $('#add-more').addEventListener('click', () => fileInput.click());
  saveButton.addEventListener('click', exportImage);
  autoToggle.addEventListener('change', () => {
    state.automatic = autoToggle.checked;
    recomputeOverlaps();
    renderAll();
  });
  $('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
  $('#help-dialog').addEventListener('click', (event) => {
    if (event.target === $('#help-dialog')) $('#help-dialog').close();
  });

  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('is-dragging'); });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove('is-dragging'); });
  }
  dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();

