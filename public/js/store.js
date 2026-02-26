const storeState = {
  addressId: null,
  addressName: '',
  items: [],
  checkoutItems: [],
};

async function initStore() {
  try {
    const addresses = await apiRequest('/addresses');
    const container = document.getElementById('store-address-buttons');
    container.innerHTML = '';
    addresses.forEach((addr) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = addr.name;
      btn.onclick = () => selectStoreAddress(addr.id, addr.name);
      container.appendChild(btn);
    });
  } catch (error) {
    console.error('Ошибка загрузки адресов:', error);
    showStoreNotification('Ошибка загрузки адресов. Попробуйте позже.');
  }
}

async function selectStoreAddress(addressId, addressName) {
  storeState.addressId = addressId;
  storeState.addressName = addressName;

  const label = document.getElementById('catalog-address-label');
  label.textContent = `Заказ цветов в ${addressName}`;

  try {
    const items = await apiRequest('/catalog');
    storeState.items = items.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      image_path: item.image_path,
      qty: 0,
    }));
    renderCatalog();
    showScreen('catalog-screen');
  } catch (error) {
    console.error('Ошибка загрузки каталога:', error);
    showStoreNotification('Ошибка загрузки каталога. Попробуйте позже.');
  }
}

function renderCatalog() {
  const list = document.getElementById('catalog-list');
  list.innerHTML = '';

  storeState.items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'catalog-item';

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'catalog-image-wrapper';
    const img = document.createElement('img');
    img.className = 'catalog-image';
    img.src = item.image_path;
    img.alt = item.name;
    imgWrapper.appendChild(img);

    const info = document.createElement('div');
    info.className = 'catalog-info';

    const title = document.createElement('div');
    title.className = 'catalog-title';
    title.textContent = item.name;

    const price = document.createElement('div');
    price.className = 'catalog-price';
    price.textContent = formatPrice(item.price);

    const controls = document.createElement('div');
    controls.className = 'catalog-qty-controls';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'qty-button';
    minusBtn.textContent = '−';
    minusBtn.disabled = item.qty === 0;
    minusBtn.onclick = () => updateItemQty(index, item.qty - 1);

    const qtyValue = document.createElement('div');
    qtyValue.className = 'qty-value';
    qtyValue.textContent = String(item.qty);

    const plusBtn = document.createElement('button');
    plusBtn.className = 'qty-button qty-button-plus';
    plusBtn.textContent = '+';
    plusBtn.onclick = () => updateItemQty(index, item.qty + 1);

    controls.appendChild(minusBtn);
    controls.appendChild(qtyValue);
    controls.appendChild(plusBtn);

    info.appendChild(title);
    info.appendChild(price);
    info.appendChild(controls);

    card.appendChild(imgWrapper);
    card.appendChild(info);

    list.appendChild(card);
  });
}

function updateItemQty(index, newQty) {
  if (newQty < 0) newQty = 0;
  storeState.items[index].qty = newQty;
  renderCatalog();
}

function goBackToStoreMain() {
  showScreen('store-main-screen');
}

function openCart() {
  const totalQty = storeState.items.reduce((sum, item) => sum + (item.qty || 0), 0);
  if (totalQty === 0) {
    showStoreNotification('Ваша корзина еще пуста. Добавьте позиции');
    return;
  }
  renderCart();
  showScreen('cart-screen');
}

function goBackToCatalog() {
  showScreen('catalog-screen');
}

function renderCart() {
  const list = document.getElementById('cart-list');
  const totalEl = document.getElementById('cart-total-value');
  if (!list || !totalEl) return;

  list.innerHTML = '';

  let total = 0;

  storeState.items.forEach((item, index) => {
    if (!item.qty) return;

    total += (Number(item.price) || 0) * item.qty;

    const row = document.createElement('div');
    row.className = 'cart-item';

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'cart-item-image-wrapper';
    const img = document.createElement('img');
    img.className = 'cart-item-image';
    img.src = item.image_path;
    img.alt = item.name;
    imgWrapper.appendChild(img);

    const info = document.createElement('div');
    info.className = 'cart-item-info';

    const title = document.createElement('div');
    title.className = 'cart-item-title';
    title.textContent = item.name;

    const price = document.createElement('div');
    price.className = 'cart-item-price';
    price.textContent = formatPrice(item.price);

    const controls = document.createElement('div');
    controls.className = 'catalog-qty-controls';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'qty-button';
    minusBtn.textContent = '−';
    minusBtn.disabled = item.qty === 0;
    minusBtn.onclick = () => {
      updateItemQty(index, item.qty - 1);
      renderCart();
    };

    const qtyValue = document.createElement('div');
    qtyValue.className = 'qty-value';
    qtyValue.textContent = String(item.qty);

    const plusBtn = document.createElement('button');
    plusBtn.className = 'qty-button qty-button-plus';
    plusBtn.textContent = '+';
    plusBtn.onclick = () => {
      updateItemQty(index, item.qty + 1);
      renderCart();
    };

    controls.appendChild(minusBtn);
    controls.appendChild(qtyValue);
    controls.appendChild(plusBtn);

    info.appendChild(title);
    info.appendChild(price);
    info.appendChild(controls);

    row.appendChild(imgWrapper);
    row.appendChild(info);

    list.appendChild(row);
  });

  totalEl.textContent = formatPrice(total);
}

function goToCheckout() {
  const totalQty = storeState.items.reduce((sum, item) => sum + (item.qty || 0), 0);
  if (totalQty === 0) {
    showStoreNotification('Ваша корзина еще пуста. Добавьте позиции');
    return;
  }

  const checkoutItems = [];
  storeState.items.forEach((item, index) => {
    for (let i = 0; i < item.qty; i += 1) {
      checkoutItems.push({
        itemIndex: index,
        id: item.id,
        name: item.name,
        price: item.price,
        image_path: item.image_path,
        mode: 'delivery',
        pickupSelf: true,
        deliveryDate: '2026-03-08',
        deliveryFromHour: '10',
        deliveryToHour: '12',
        pickupDate: '2026-03-08',
        pickupFromHour: '10',
        pickupToHour: '12',
      });
    }
  });

  storeState.checkoutItems = checkoutItems;
  renderCheckout();
  showScreen('checkout-screen');
}

function goBackToCart() {
  showScreen('cart-screen');
}

function renderCheckout() {
  const container = document.getElementById('checkout-items');
  const clientPhoneInput = document.getElementById('checkout-client-phone');
  if (clientPhoneInput) {
    attachPhoneMask(clientPhoneInput);
  }
  if (!container) return;
  container.innerHTML = '';

  storeState.checkoutItems.forEach((ci, idx) => {
    if (typeof ci.needCard !== 'boolean') {
      ci.needCard = false;
    }
    if (typeof ci.cardText !== 'string') {
      ci.cardText = '';
    }
    const wrap = document.createElement('div');
    wrap.className = 'checkout-item';

    const main = document.createElement('div');
    main.className = 'checkout-item-main';

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'cart-item-image-wrapper';
    const img = document.createElement('img');
    img.className = 'cart-item-image';
    img.src = ci.image_path;
    img.alt = ci.name;
    imgWrapper.appendChild(img);

    const text = document.createElement('div');
    text.className = 'checkout-item-text';

    const title = document.createElement('div');
    title.className = 'cart-item-title';
    title.textContent = ci.name;

    const price = document.createElement('div');
    price.className = 'cart-item-price';
    price.textContent = formatPrice(ci.price);

    text.appendChild(title);
    text.appendChild(price);

    main.appendChild(imgWrapper);
    main.appendChild(text);

    const toggle = document.createElement('div');
    toggle.className = 'checkout-toggle';

    const deliveryBtn = document.createElement('button');
    deliveryBtn.type = 'button';
    deliveryBtn.className = 'checkout-toggle-option';
    deliveryBtn.textContent = 'Доставка';

    const pickupBtn = document.createElement('button');
    pickupBtn.type = 'button';
    pickupBtn.className = 'checkout-toggle-option';
    pickupBtn.textContent = 'Самовывоз';

    toggle.appendChild(deliveryBtn);
    toggle.appendChild(pickupBtn);

    const deliveryBlock = document.createElement('div');
    deliveryBlock.className = 'checkout-section';

    const deliveryDateRow = document.createElement('div');
    deliveryDateRow.className = 'checkout-row';
    const deliveryDateLabel = document.createElement('div');
    deliveryDateLabel.className = 'checkout-label';
    deliveryDateLabel.textContent = 'Дата*';
    const deliveryDateInput = document.createElement('input');
    deliveryDateInput.type = 'date';
    deliveryDateInput.className = 'checkout-date-input';
    deliveryDateInput.value = ci.deliveryDate;
    deliveryDateInput.onchange = () => {
      ci.deliveryDate = deliveryDateInput.value;
    };
    deliveryDateRow.appendChild(deliveryDateLabel);
    deliveryDateRow.appendChild(deliveryDateInput);

    const deliveryTimeRow = document.createElement('div');
    deliveryTimeRow.className = 'checkout-row';
    const deliveryTimeLabel = document.createElement('div');
    deliveryTimeLabel.className = 'checkout-label';
    deliveryTimeLabel.textContent = 'Выберите временной интервал*';
    const deliveryTimeWrap = document.createElement('div');
    deliveryTimeWrap.className = 'checkout-time-wrap';
    const deliveryFromText = document.createElement('span');
    deliveryFromText.textContent = 'с';
    const deliveryFromSelect = document.createElement('select');
    deliveryFromSelect.className = 'checkout-time-select';
    const deliveryToText = document.createElement('span');
    deliveryToText.textContent = 'по';
    const deliveryToSelect = document.createElement('select');
    deliveryToSelect.className = 'checkout-time-select';

    function fillDeliveryFromOptions() {
      deliveryFromSelect.innerHTML = '';
      for (let h = 7; h <= 21; h += 1) {
        const opt = document.createElement('option');
        opt.value = String(h).padStart(2, '0');
        opt.textContent = String(h).padStart(2, '0');
        deliveryFromSelect.appendChild(opt);
      }
    }

    function fillDeliveryToOptions() {
      deliveryToSelect.innerHTML = '';
      const from = Number(ci.deliveryFromHour || '7');
      let start = from + 2;
      if (start > 21) start = 21;
      for (let h = start; h <= 21; h += 1) {
        const opt = document.createElement('option');
        opt.value = String(h).padStart(2, '0');
        opt.textContent = String(h).padStart(2, '0');
        deliveryToSelect.appendChild(opt);
      }
    }

    fillDeliveryFromOptions();
    deliveryFromSelect.value = ci.deliveryFromHour;
    deliveryFromSelect.onchange = () => {
      ci.deliveryFromHour = deliveryFromSelect.value;
      const from = Number(ci.deliveryFromHour || '7');
      let minTo = from + 2;
      if (minTo > 21) minTo = 21;
      if (!ci.deliveryToHour || Number(ci.deliveryToHour) < minTo) {
        ci.deliveryToHour = String(minTo).padStart(2, '0');
      }
      fillDeliveryToOptions();
      deliveryToSelect.value = ci.deliveryToHour;
    };

    fillDeliveryToOptions();
    {
      const from = Number(ci.deliveryFromHour || '7');
      let minTo = from + 2;
      if (minTo > 21) minTo = 21;
      if (!ci.deliveryToHour || Number(ci.deliveryToHour) < minTo) {
        ci.deliveryToHour = String(minTo).padStart(2, '0');
      }
      deliveryToSelect.value = ci.deliveryToHour;
    }
    deliveryToSelect.onchange = () => {
      ci.deliveryToHour = deliveryToSelect.value;
    };

    deliveryTimeWrap.appendChild(deliveryFromText);
    deliveryTimeWrap.appendChild(deliveryFromSelect);
    deliveryTimeWrap.appendChild(deliveryToText);
    deliveryTimeWrap.appendChild(deliveryToSelect);
    deliveryTimeRow.appendChild(deliveryTimeLabel);
    deliveryTimeRow.appendChild(deliveryTimeWrap);

    const recipientName = document.createElement('input');
    recipientName.type = 'text';
    recipientName.className = 'checkout-input delivery-recipient-name';
    recipientName.placeholder = 'Введите ФИО получателя *';
    const recipientPhone = document.createElement('input');
    recipientPhone.type = 'tel';
    recipientPhone.className = 'checkout-input phone-input delivery-recipient-phone';
    recipientPhone.placeholder = 'Введите номер телефона получателя *';
    const address = document.createElement('textarea');
    address.className = 'checkout-textarea delivery-address';
    address.placeholder = 'Адрес доставки *';

    deliveryBlock.appendChild(deliveryDateRow);
    deliveryBlock.appendChild(deliveryTimeRow);
    deliveryBlock.appendChild(recipientName);
    deliveryBlock.appendChild(recipientPhone);
    deliveryBlock.appendChild(address);

    const pickupBlock = document.createElement('div');
    pickupBlock.className = 'checkout-section';

    const pickupCheckboxRow = document.createElement('label');
    pickupCheckboxRow.className = 'checkout-checkbox';
    const pickupCheckbox = document.createElement('input');
    pickupCheckbox.type = 'checkbox';
    pickupCheckbox.checked = ci.pickupSelf;
    const pickupCheckboxText = document.createElement('span');
    pickupCheckboxText.textContent = 'Я лично заберу заказ';
    pickupCheckboxRow.appendChild(pickupCheckbox);
    pickupCheckboxRow.appendChild(pickupCheckboxText);

    const pickupDateRow = document.createElement('div');
    pickupDateRow.className = 'checkout-row';
    const pickupDateLabel = document.createElement('div');
    pickupDateLabel.className = 'checkout-label';
    pickupDateLabel.textContent = 'Дата*';
    const pickupDateInput = document.createElement('input');
    pickupDateInput.type = 'date';
    pickupDateInput.className = 'checkout-date-input';
    pickupDateInput.value = ci.pickupDate;
    pickupDateInput.onchange = () => {
      ci.pickupDate = pickupDateInput.value;
    };
    pickupDateRow.appendChild(pickupDateLabel);
    pickupDateRow.appendChild(pickupDateInput);

    const pickupTimeRow = document.createElement('div');
    pickupTimeRow.className = 'checkout-row';
    const pickupTimeLabel = document.createElement('div');
    pickupTimeLabel.className = 'checkout-label';
    pickupTimeLabel.textContent = 'Выберите временной интервал*';
    const pickupTimeWrap = document.createElement('div');
    pickupTimeWrap.className = 'checkout-time-wrap';
    const pickupFromText = document.createElement('span');
    pickupFromText.textContent = 'с';
    const pickupFromSelect = document.createElement('select');
    pickupFromSelect.className = 'checkout-time-select';
    const pickupToText = document.createElement('span');
    pickupToText.textContent = 'по';
    const pickupToSelect = document.createElement('select');
    pickupToSelect.className = 'checkout-time-select';

    function fillPickupFromOptions() {
      pickupFromSelect.innerHTML = '';
      for (let h = 7; h <= 21; h += 1) {
        const opt = document.createElement('option');
        opt.value = String(h).padStart(2, '0');
        opt.textContent = String(h).padStart(2, '0');
        pickupFromSelect.appendChild(opt);
      }
    }

    function fillPickupToOptions() {
      pickupToSelect.innerHTML = '';
      const from = Number(ci.pickupFromHour || '7');
      let start = from + 2;
      if (start > 21) start = 21;
      for (let h = start; h <= 21; h += 1) {
        const opt = document.createElement('option');
        opt.value = String(h).padStart(2, '0');
        opt.textContent = String(h).padStart(2, '0');
        pickupToSelect.appendChild(opt);
      }
    }

    fillPickupFromOptions();
    pickupFromSelect.value = ci.pickupFromHour;
    pickupFromSelect.onchange = () => {
      ci.pickupFromHour = pickupFromSelect.value;
      const from = Number(ci.pickupFromHour || '7');
      let minTo = from + 2;
      if (minTo > 21) minTo = 21;
      if (!ci.pickupToHour || Number(ci.pickupToHour) < minTo) {
        ci.pickupToHour = String(minTo).padStart(2, '0');
      }
      fillPickupToOptions();
      pickupToSelect.value = ci.pickupToHour;
    };

    fillPickupToOptions();
    {
      const from = Number(ci.pickupFromHour || '7');
      let minTo = from + 2;
      if (minTo > 21) minTo = 21;
      if (!ci.pickupToHour || Number(ci.pickupToHour) < minTo) {
        ci.pickupToHour = String(minTo).padStart(2, '0');
      }
      pickupToSelect.value = ci.pickupToHour;
    }
    pickupToSelect.onchange = () => {
      ci.pickupToHour = pickupToSelect.value;
    };

    pickupTimeWrap.appendChild(pickupFromText);
    pickupTimeWrap.appendChild(pickupFromSelect);
    pickupTimeWrap.appendChild(pickupToText);
    pickupTimeWrap.appendChild(pickupToSelect);
    pickupTimeRow.appendChild(pickupTimeLabel);
    pickupTimeRow.appendChild(pickupTimeWrap);

    const pickupOtherName = document.createElement('input');
    pickupOtherName.type = 'text';
    pickupOtherName.className = 'checkout-input pickup-other-name';
    pickupOtherName.placeholder = 'ФИО того, кто заберет заказ *';
    const pickupOtherPhone = document.createElement('input');
    pickupOtherPhone.type = 'tel';
    pickupOtherPhone.className = 'checkout-input phone-input pickup-other-phone';
    pickupOtherPhone.placeholder = 'Номер телефона того, кто заберет заказ *';

    pickupBlock.appendChild(pickupCheckboxRow);
    pickupBlock.appendChild(pickupDateRow);
    pickupBlock.appendChild(pickupTimeRow);
    pickupBlock.appendChild(pickupOtherName);
    pickupBlock.appendChild(pickupOtherPhone);

    const cardSection = document.createElement('div');
    cardSection.className = 'checkout-section card-section';

    const cardCheckboxRow = document.createElement('label');
    cardCheckboxRow.className = 'checkout-checkbox card-checkbox';
    const cardCheckbox = document.createElement('input');
    cardCheckbox.type = 'checkbox';
    cardCheckbox.checked = !!ci.needCard;
    const cardCheckboxText = document.createElement('span');
    cardCheckboxText.textContent = 'Нужно добавить открытку';
    cardCheckboxRow.appendChild(cardCheckbox);
    cardCheckboxRow.appendChild(cardCheckboxText);

    const cardTextInput = document.createElement('textarea');
    cardTextInput.className = 'checkout-textarea card-text-input';
    cardTextInput.placeholder = 'Что написать на открытке?';
    cardTextInput.value = ci.cardText || '';
    cardTextInput.style.display = ci.needCard ? 'block' : 'none';

    cardCheckbox.onchange = () => {
      ci.needCard = cardCheckbox.checked;
      cardTextInput.style.display = ci.needCard ? 'block' : 'none';
      if (!ci.needCard) {
        ci.cardText = '';
        cardTextInput.value = '';
      }
    };

    cardTextInput.oninput = () => {
      ci.cardText = cardTextInput.value;
    };

    cardSection.appendChild(cardCheckboxRow);
    cardSection.appendChild(cardTextInput);

    function updateMode() {
      if (ci.mode === 'delivery') {
        deliveryBtn.classList.add('active');
        pickupBtn.classList.remove('active');
        deliveryBlock.style.display = 'flex';
        pickupBlock.style.display = 'none';
      } else {
        deliveryBtn.classList.remove('active');
        pickupBtn.classList.add('active');
        deliveryBlock.style.display = 'none';
        pickupBlock.style.display = 'flex';
      }
    }

    deliveryBtn.onclick = () => {
      ci.mode = 'delivery';
      updateMode();
    };
    pickupBtn.onclick = () => {
      ci.mode = 'pickup';
      updateMode();
    };

    function updatePickupFieldsVisibility() {
      if (pickupCheckbox.checked) {
        pickupOtherName.style.display = 'none';
        pickupOtherPhone.style.display = 'none';
      } else {
        pickupOtherName.style.display = 'block';
        pickupOtherPhone.style.display = 'block';
      }
    }

    pickupCheckbox.onchange = () => {
      ci.pickupSelf = pickupCheckbox.checked;
      updatePickupFieldsVisibility();
    };

    updateMode();
    updatePickupFieldsVisibility();

    wrap.appendChild(main);
    wrap.appendChild(toggle);
    wrap.appendChild(deliveryBlock);
    wrap.appendChild(pickupBlock);
    wrap.appendChild(cardSection);

    container.appendChild(wrap);

    const phoneInputs = wrap.querySelectorAll('.phone-input');
    phoneInputs.forEach((input) => attachPhoneMask(input));
  });
}

function attachPhoneMask(input) {
  input.addEventListener('focus', () => {
    if (!input.value) {
      input.value = '+7';
    }
  });
  input.addEventListener('input', () => {
    let digits = input.value.replace(/[^\d]/g, '');
    if (!digits.startsWith('7')) {
      digits = '7' + digits.replace(/^7+/, '');
    }
    digits = digits.slice(0, 11);
    const rest = digits.slice(1);
    input.value = '+7' + rest;
  });
}

async function openConsentScreen() {
  try {
    const contentEl = document.getElementById('consent-content');
    if (contentEl) {
      contentEl.textContent = 'Загрузка...';
    }
    const response = await fetch('/api/consent');
    if (!response.ok) {
      throw new Error('Failed to load consent text');
    }
    const data = await response.json();
    if (contentEl) {
      contentEl.textContent = data.text || '';
    }
    showScreen('consent-screen');
  } catch (error) {
    console.error('Ошибка загрузки текста согласия:', error);
    showStoreNotification('Ошибка загрузки текста согласия');
  }
}

function goBackFromConsent() {
  showScreen('checkout-screen');
}

function submitCheckout() {
  let hasError = false;

  const nameInput = document.getElementById('checkout-client-name');
  const phoneInput = document.getElementById('checkout-client-phone');
  const telegramInput = document.getElementById('checkout-client-telegram');
  const consentCheckbox = document.getElementById('consent-checkbox');

  if (!nameInput || !phoneInput || !consentCheckbox) {
    return;
  }

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const telegram = telegramInput ? telegramInput.value.trim() : '';

  if (!name) {
    hasError = true;
  }

  if (!phone || phone === '+7') {
    hasError = true;
  }

  const itemNodes = document.querySelectorAll('.checkout-item');

  storeState.checkoutItems.forEach((ci, idx) => {
    const itemEl = itemNodes[idx];
    if (!itemEl) return;

    if (ci.mode === 'delivery') {
      const dateInput = itemEl.querySelector('.checkout-date-input');
      const fromSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(1)');
      const toSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(2)');
      const recipientName = itemEl.querySelector('.delivery-recipient-name');
      const recipientPhone = itemEl.querySelector('.delivery-recipient-phone');
      const address = itemEl.querySelector('.delivery-address');

      if (!dateInput || !dateInput.value) hasError = true;
      if (!fromSelect || !fromSelect.value) hasError = true;
      if (!toSelect || !toSelect.value) hasError = true;
      if (!recipientName || !recipientName.value.trim()) hasError = true;
      if (!recipientPhone || !recipientPhone.value.trim() || recipientPhone.value.trim() === '+7') hasError = true;
      if (!address || !address.value.trim()) hasError = true;
    } else {
      const dateInput = itemEl.querySelector('.checkout-date-input');
      const fromSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(1)');
      const toSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(2)');
      if (!dateInput || !dateInput.value) hasError = true;
      if (!fromSelect || !fromSelect.value) hasError = true;
      if (!toSelect || !toSelect.value) hasError = true;

      const pickupCheckbox = itemEl.querySelector('.checkout-checkbox input[type="checkbox"]');
      const pickupOtherName = itemEl.querySelector('.pickup-other-name');
      const pickupOtherPhone = itemEl.querySelector('.pickup-other-phone');

      const selfPickup = pickupCheckbox ? pickupCheckbox.checked : true;

      if (!selfPickup) {
        if (!pickupOtherName || !pickupOtherName.value.trim()) hasError = true;
        if (!pickupOtherPhone || !pickupOtherPhone.value.trim() || pickupOtherPhone.value.trim() === '+7') hasError = true;
      }
    }
  });

  if (!consentCheckbox.checked) {
    hasError = true;
  }

  if (hasError) {
    showStoreNotification('Заполните обязательные поля для заказа');
    return;
  }

  const overlay = document.getElementById('order-confirm-overlay');
  const content = document.getElementById('order-confirm-content');
  if (!overlay || !content) {
    return;
  }

  content.innerHTML = '';

  const clientBlock = document.createElement('div');
  clientBlock.className = 'order-confirm-block';
  const clientTitle = document.createElement('div');
  clientTitle.className = 'order-confirm-section-title';
  clientTitle.textContent = 'Ваши данные';
  const clientName = document.createElement('div');
  clientName.textContent = 'ФИО: ' + name;
  const clientPhone = document.createElement('div');
  clientPhone.textContent = 'Телефон: ' + phone;
  clientBlock.appendChild(clientTitle);
  clientBlock.appendChild(clientName);
  clientBlock.appendChild(clientPhone);
  if (telegram) {
    const clientTelegram = document.createElement('div');
    clientTelegram.textContent = 'Ник Telegram: ' + telegram;
    clientBlock.appendChild(clientTelegram);
  }
  content.appendChild(clientBlock);

  storeState.checkoutItems.forEach((ci, idx) => {
    const itemEl = itemNodes[idx];
    if (!itemEl) return;

    const block = document.createElement('div');
    block.className = 'order-confirm-block';

    const title = document.createElement('div');
    title.className = 'order-confirm-section-title';
    title.textContent = 'Позиция: ' + ci.name;
    block.appendChild(title);

    const modeLine = document.createElement('div');
    modeLine.textContent = 'Тип: ' + (ci.mode === 'delivery' ? 'Доставка' : 'Самовывоз');
    block.appendChild(modeLine);

    if (ci.mode === 'delivery') {
      const dateInput = itemEl.querySelector('.checkout-date-input');
      const fromSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(1)');
      const toSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(2)');
      const recipientName = itemEl.querySelector('.delivery-recipient-name');
      const recipientPhone = itemEl.querySelector('.delivery-recipient-phone');
      const address = itemEl.querySelector('.delivery-address');

      if (dateInput) {
        const line = document.createElement('div');
        line.textContent = 'Дата: ' + dateInput.value;
        block.appendChild(line);
      }
      if (fromSelect && toSelect) {
        const line = document.createElement('div');
        line.textContent = 'Время: с ' + fromSelect.value + ' по ' + toSelect.value;
        block.appendChild(line);
      }
      if (recipientName) {
        const line = document.createElement('div');
        line.textContent = 'Получатель: ' + recipientName.value;
        block.appendChild(line);
      }
      if (recipientPhone) {
        const line = document.createElement('div');
        line.textContent = 'Телефон получателя: ' + recipientPhone.value;
        block.appendChild(line);
      }
      if (address) {
        const line = document.createElement('div');
        line.textContent = 'Адрес доставки: ' + address.value;
        block.appendChild(line);
      }
    } else {
      const dateInput = itemEl.querySelector('.checkout-date-input');
      const fromSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(1)');
      const toSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(2)');
      const pickupCheckbox = itemEl.querySelector('.checkout-checkbox input[type="checkbox"]');
      const pickupOtherName = itemEl.querySelector('.pickup-other-name');
      const pickupOtherPhone = itemEl.querySelector('.pickup-other-phone');

      if (dateInput) {
        const line = document.createElement('div');
        line.textContent = 'Дата: ' + dateInput.value;
        block.appendChild(line);
      }
      if (fromSelect && toSelect) {
        const line = document.createElement('div');
        line.textContent = 'Время: с ' + fromSelect.value + ' по ' + toSelect.value;
        block.appendChild(line);
      }

      const selfPickup = pickupCheckbox ? pickupCheckbox.checked : true;
      if (selfPickup) {
        const line = document.createElement('div');
        line.textContent = 'Заберу лично';
        block.appendChild(line);
      } else {
        if (pickupOtherName) {
          const line = document.createElement('div');
          line.textContent = 'ФИО того, кто заберёт: ' + pickupOtherName.value;
          block.appendChild(line);
        }
        if (pickupOtherPhone) {
          const line = document.createElement('div');
          line.textContent = 'Телефон того, кто заберёт: ' + pickupOtherPhone.value;
          block.appendChild(line);
        }
      }
    }

    const cardCheckbox = itemEl.querySelector('.card-checkbox input[type="checkbox"]');
    const cardTextInput = itemEl.querySelector('.card-text-input');
    const needCard = cardCheckbox ? cardCheckbox.checked : false;
    if (needCard) {
      const line = document.createElement('div');
      const txt = cardTextInput ? cardTextInput.value : '';
      line.textContent = 'Открытка: ' + (txt || 'нужно добавить');
      block.appendChild(line);
    }

    content.appendChild(block);
  });

  overlay.style.display = 'flex';
}

function editCheckout() {
  const overlay = document.getElementById('order-confirm-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

async function confirmCheckout() {
  const overlay = document.getElementById('order-confirm-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  const nameInput = document.getElementById('checkout-client-name');
  const phoneInput = document.getElementById('checkout-client-phone');
  const telegramInput = document.getElementById('checkout-client-telegram');
  if (!nameInput || !phoneInput) {
    showStoreNotification('Ошибка: отсутствуют данные клиента');
    return;
  }
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const telegram = telegramInput ? telegramInput.value.trim() : '';
  const itemNodes = document.querySelectorAll('.checkout-item');
  const itemsPayload = [];
  storeState.checkoutItems.forEach((ci, idx) => {
    const itemEl = itemNodes[idx];
    if (!itemEl) return;
    const isDelivery = ci.mode === 'delivery';
    const dateInput = itemEl.querySelector('.checkout-date-input');
    const fromSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(1)');
    const toSelect = itemEl.querySelector('.checkout-time-wrap .checkout-time-select:nth-of-type(2)');
    const executionDate = dateInput ? dateInput.value : '';
    const fromHour = fromSelect ? fromSelect.value : '';
    const toHour = toSelect ? toSelect.value : '';
    const payloadItem = {
      catalogItemId: ci.id,
      catalogItemName: ci.name,
      catalogItemPrice: ci.price,
      imagePath: ci.image_path,
      fulfillmentType: isDelivery ? 'delivery' : 'pickup',
      executionDate,
      fromHour,
      toHour,
      pickupSelf: !!ci.pickupSelf,
      recipientName: '',
      recipientPhone: '',
      recipientAddress: '',
      pickupOtherName: '',
      pickupOtherPhone: '',
      cardNeeded: false,
      cardText: '',
    };
    if (isDelivery) {
      const recipientName = itemEl.querySelector('.delivery-recipient-name');
      const recipientPhone = itemEl.querySelector('.delivery-recipient-phone');
      const address = itemEl.querySelector('.delivery-address');
      payloadItem.recipientName = recipientName ? recipientName.value.trim() : '';
      payloadItem.recipientPhone = recipientPhone ? recipientPhone.value.trim() : '';
      payloadItem.recipientAddress = address ? address.value.trim() : '';
    } else {
      const pickupCheckbox = itemEl.querySelector('.checkout-checkbox input[type="checkbox"]');
      const pickupOtherName = itemEl.querySelector('.pickup-other-name');
      const pickupOtherPhone = itemEl.querySelector('.pickup-other-phone');
      const selfPickup = pickupCheckbox ? pickupCheckbox.checked : true;
      payloadItem.pickupSelf = selfPickup;
      if (!selfPickup) {
        payloadItem.pickupOtherName = pickupOtherName ? pickupOtherName.value.trim() : '';
        payloadItem.pickupOtherPhone = pickupOtherPhone ? pickupOtherPhone.value.trim() : '';
      }
    }
    const cardCheckbox = itemEl.querySelector('.card-checkbox input[type="checkbox"]');
    const cardTextInput = itemEl.querySelector('.card-text-input');
    const needCard = cardCheckbox ? cardCheckbox.checked : false;
    payloadItem.cardNeeded = needCard;
    if (needCard) {
      payloadItem.cardText = cardTextInput ? cardTextInput.value.trim() : '';
    } else {
      payloadItem.cardText = '';
    }
    itemsPayload.push(payloadItem);
  });
  const payload = {
    addressId: storeState.addressId,
    addressName: storeState.addressName,
    clientName: name,
    clientPhone: phone,
    clientTelegram: telegram,
    clientChatId: getTelegramChatId(),
    items: itemsPayload,
  };
  setStoreLoading(true);
  try {
    const result = await apiRequest('/store/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const mainEl = document.querySelector('.checkout-success-main');
    if (mainEl) {
      if (result && typeof result.number === 'number') {
        mainEl.textContent = 'Ваш заказ № ' + result.number + ' отправлен!';
      } else {
        mainEl.textContent = 'Ваш заказ отправлен!';
      }
    }
    showScreen('checkout-success-screen');
  } catch (error) {
    console.error('Ошибка создания заказа:', error);
    showStoreNotification('Не получилось отправить сообщение менеджеру. Попробуйте ещё раз');
  } finally {
    setStoreLoading(false);
  }
}

function showScreen(screenId) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach((s) => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
  }
}

function showStoreNotification(message) {
  const el = document.getElementById('store-notification');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
  }, 2000);
}

function formatPrice(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('ru-RU') + ' ₽';
}

function getTelegramChatId() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
      return String(tg.initDataUnsafe.user.id);
    }
  } catch (e) {
    console.error('Ошибка получения chat id Telegram:', e);
  }
  return null;
}

function setStoreLoading(isLoading) {
  const overlay = document.getElementById('store-loading-overlay');
  if (!overlay) return;
  overlay.style.display = isLoading ? 'flex' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  initStore();
});
