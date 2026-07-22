(() => {
  'use strict';

  const config = window.RESERVAS_CONFIG || {};
  const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const cycleStart = config.cycleStart || '2026-07-20';
  const cycleEnd = config.cycleEnd || '2026-12-20';
  const academicScheduleEnd = config.academicScheduleEnd || '2026-11-14';
  const roomCodes = ['L601', 'L602', 'L603', '708', '709', '710', '711'];
  const dayNames = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'];

  const elements = {
    connectionStatus: document.getElementById('connectionStatus'),
    systemMessage: document.getElementById('systemMessage'),
    userView: document.getElementById('userView'),
    logoutButton: document.getElementById('logoutButton'),
    currentUserName: document.getElementById('currentUserName'),
    bookingForm: document.getElementById('bookingForm'),
    bookingDate: document.getElementById('bookingDate'),
    bookingRoom: document.getElementById('bookingRoom'),
    bookingStart: document.getElementById('bookingStart'),
    bookingEnd: document.getElementById('bookingEnd'),
    bookingActivity: document.getElementById('bookingActivity'),
    availabilityCheck: document.getElementById('availabilityCheck'),
    saveBookingButton: document.getElementById('saveBookingButton'),
    refreshButton: document.getElementById('refreshButton'),
    myBookingsList: document.getElementById('myBookingsList'),
    boardDate: document.getElementById('boardDate'),
    boardRoom: document.getElementById('boardRoom'),
    availabilityBoard: document.getElementById('availabilityBoard'),
    publicReservationsList: document.getElementById('publicReservationsList'),
    reservationBoard: document.getElementById('reservationBoard'),
    adminPanel: document.getElementById('adminPanel'),
    createUserForm: document.getElementById('createUserForm'),
    adminBookingsList: document.getElementById('adminBookingsList')
  };

  const state = {
    client: null,
    session: null,
    profile: null,
    rooms: roomCodes.map((code) => ({ id: null, code, name: `Aula ${code}` })),
    fixedOccupancies: [],
    reservations: []
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function showMessage(message, type = 'success') {
    elements.systemMessage.textContent = message;
    elements.systemMessage.classList.toggle('is-error', type === 'error');
    elements.systemMessage.hidden = false;
  }

  function clearMessage() {
    elements.systemMessage.hidden = true;
    elements.systemMessage.textContent = '';
    elements.systemMessage.classList.remove('is-error');
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  }

  function localDateString(date = new Date()) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function initialDate() {
    const today = localDateString();
    if (today < cycleStart) return cycleStart;
    if (today > cycleEnd) return cycleEnd;
    return today;
  }

  function dayName(dateString) {
    return dayNames[new Date(`${dateString}T12:00:00`).getDay()];
  }

  function normalizeTime(value) {
    return String(value || '').slice(0, 5);
  }

  function overlaps(startA, endA, startB, endB) {
    return normalizeTime(startA) < normalizeTime(endB) && normalizeTime(endA) > normalizeTime(startB);
  }

  function baseConflict(roomCode, date, start, end) {
    if (date > academicScheduleEnd) return null;
    const selectedDay = new Date(`${date}T12:00:00`).getDay();
    return state.fixedOccupancies.find((record) =>
      record.classrooms?.code === roomCode &&
      record.day_of_week === selectedDay &&
      overlaps(start, end, record.start_time, record.end_time)
    );
  }

  function reservationConflict(roomCode, date, start, end, excludeId = null) {
    return state.reservations.find((reservation) =>
      reservation.id !== excludeId &&
      reservation.status === 'active' &&
      reservation.reservation_date === date &&
      reservation.classrooms?.code === roomCode &&
      overlaps(start, end, reservation.start_time, reservation.end_time)
    );
  }

  function validateSlot({ room, date, start, end }) {
    if (!room || !date || !start || !end) return { ok: false, message: 'Completa la fecha, el aula y las dos horas.' };
    if (date < cycleStart || date > cycleEnd) return { ok: false, message: `La fecha debe estar entre ${formatDate(cycleStart)} y ${formatDate(cycleEnd)}.` };
    if (dayName(date) === 'DOMINGO') return { ok: false, message: 'No se permiten reservas los domingos.' };
    if (start >= end) return { ok: false, message: 'La hora de finalización debe ser posterior a la hora de inicio.' };
    const fixed = baseConflict(room, date, start, end);
    if (fixed) return { ok: false, message: `El aula tiene una ocupación fija de ${normalizeTime(fixed.start_time)} a ${normalizeTime(fixed.end_time)}: ${fixed.label}.` };
    const reserved = reservationConflict(room, date, start, end);
    if (reserved) return { ok: false, message: `Ya existe una reserva de ${normalizeTime(reserved.start_time)} a ${normalizeTime(reserved.end_time)}.` };
    return { ok: true, message: 'Horario disponible. Puedes guardar la reserva.' };
  }

  function updateAvailability() {
    const result = validateSlot({
      room: elements.bookingRoom.value,
      date: elements.bookingDate.value,
      start: elements.bookingStart.value,
      end: elements.bookingEnd.value
    });
    elements.availabilityCheck.textContent = result.message;
    elements.availabilityCheck.classList.toggle('is-available', result.ok);
    elements.availabilityCheck.classList.toggle('is-conflict', !result.ok && Boolean(elements.bookingStart.value && elements.bookingEnd.value));
    elements.saveBookingButton.disabled = !result.ok || !isConfigured;
    return result;
  }

  function formatDate(dateString, options = {}) {
    return new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', ...options })
      .format(new Date(`${dateString}T12:00:00`));
  }

  function dateBadge(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    return `<span class="booking-date"><strong>${String(date.getDate()).padStart(2, '0')}</strong><span>${monthNames[date.getMonth()]}</span></span>`;
  }

  function roomOptions(includeAll = false) {
    const prefix = includeAll ? '<option value="TODAS">Todas</option>' : '<option value="">Selecciona un aula</option>';
    return prefix + state.rooms.map((room) => `<option value="${escapeHtml(room.code)}">Aula ${escapeHtml(room.code)}</option>`).join('');
  }

  function populateRoomSelects() {
    elements.bookingRoom.innerHTML = roomOptions(false);
    elements.boardRoom.innerHTML = roomOptions(true);
  }

  function reservationCard(reservation, controls = false) {
    const canCancel = controls && (state.profile?.role === 'admin' || reservation.user_id === state.session?.user?.id);
    const action = canCancel ? `<button class="danger-button" type="button" data-cancel-reservation="${escapeHtml(reservation.id)}">Cancelar</button>` : `<span class="reservation-time">${normalizeTime(reservation.start_time)}–${normalizeTime(reservation.end_time)}</span>`;
    return `
      <article class="${controls ? 'booking-item' : 'reservation-item'}">
        ${controls ? dateBadge(reservation.reservation_date) : `<span class="room-pill">${escapeHtml(reservation.classrooms?.code || 'Aula')}</span>`}
        <div class="booking-copy">
          <strong>${escapeHtml(reservation.activity)}</strong>
          <span>${controls ? `Aula ${escapeHtml(reservation.classrooms?.code)} · ` : `${escapeHtml(reservation.professor_name)} · `}${normalizeTime(reservation.start_time)}–${normalizeTime(reservation.end_time)}${controls ? '' : ` · ${formatDate(reservation.reservation_date)}`}</span>
        </div>
        ${action}
      </article>`;
  }

  function timeToMinutes(time) {
    const [hours, minutes] = normalizeTime(time).split(':').map(Number);
    return hours * 60 + minutes;
  }

  function minutesToTime(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  function occupiedIntervals(roomCode, selectedDate) {
    const selectedDay = new Date(`${selectedDate}T12:00:00`).getDay();
    const fixed = selectedDate <= academicScheduleEnd
      ? state.fixedOccupancies
          .filter((record) => record.classrooms?.code === roomCode && record.day_of_week === selectedDay)
          .map((record) => ({ start: timeToMinutes(record.start_time), end: timeToMinutes(record.end_time), label: record.label }))
      : [];
    const reservations = state.reservations
      .filter((item) => item.status === 'active' && item.reservation_date === selectedDate && item.classrooms?.code === roomCode)
      .map((item) => ({ start: timeToMinutes(item.start_time), end: timeToMinutes(item.end_time), label: item.activity }));
    return [...fixed, ...reservations].sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function timelineForRoom(roomCode, selectedDate) {
    const opening = 7 * 60;
    const closing = 21 * 60 + 30;
    const occupied = occupiedIntervals(roomCode, selectedDate);
    const merged = [];
    occupied.forEach((slot) => {
      const start = Math.max(opening, slot.start);
      const end = Math.min(closing, slot.end);
      if (end <= opening || start >= closing) return;
      const previous = merged[merged.length - 1];
      if (previous && start <= previous.end) {
        previous.end = Math.max(previous.end, end);
        previous.labels.push(slot.label);
      } else {
        merged.push({ start, end, labels: [slot.label] });
      }
    });

    const timeline = [];
    let cursor = opening;
    merged.forEach((slot) => {
      if (cursor < slot.start) timeline.push({ start: cursor, end: slot.start, free: true, label: 'Disponible' });
      timeline.push({ start: slot.start, end: slot.end, free: false, label: [...new Set(slot.labels)].join(' · ') });
      cursor = Math.max(cursor, slot.end);
    });
    if (cursor < closing) timeline.push({ start: cursor, end: closing, free: true, label: 'Disponible' });
    return timeline;
  }

  function renderAvailability() {
    const selectedDate = elements.boardDate.value;
    const selectedRoom = elements.boardRoom.value;
    const rooms = selectedRoom === 'TODAS' ? state.rooms : state.rooms.filter((room) => room.code === selectedRoom);
    elements.availabilityBoard.innerHTML = rooms.map((room) => {
      const slots = timelineForRoom(room.code, selectedDate);
      return `
        <article class="availability-room">
          <h3>Aula ${escapeHtml(room.code)}</h3>
          <div class="availability-slots">
            ${slots.map((slot) => `<span class="availability-slot ${slot.free ? 'is-free' : 'is-busy'}" title="${escapeHtml(slot.label)}">${minutesToTime(slot.start)}–${minutesToTime(slot.end)} · ${slot.free ? 'Disponible' : 'Ocupado'}</span>`).join('')}
          </div>
        </article>`;
    }).join('');
  }

  function renderPublicReservations() {
    const selectedDate = elements.boardDate.value;
    const selectedRoom = elements.boardRoom.value;
    const reservations = state.reservations
      .filter((item) => item.status === 'active' && item.reservation_date === selectedDate && (selectedRoom === 'TODAS' || item.classrooms?.code === selectedRoom))
      .sort((a, b) => a.start_time.localeCompare(b.start_time) || (a.classrooms?.code || '').localeCompare(b.classrooms?.code || ''));
    elements.publicReservationsList.innerHTML = reservations.length
      ? reservations.map((item) => reservationCard(item, false)).join('')
      : '<p class="empty-state">No hay reservas registradas para esta fecha.</p>';
    renderAvailability();
  }

  function renderMyReservations() {
    if (!state.session) return;
    const today = localDateString();
    const mine = state.reservations
      .filter((item) => item.status === 'active' && item.user_id === state.session.user.id && item.reservation_date >= today)
      .sort((a, b) => a.reservation_date.localeCompare(b.reservation_date) || a.start_time.localeCompare(b.start_time));
    elements.myBookingsList.innerHTML = mine.length
      ? mine.map((item) => reservationCard(item, true)).join('')
      : '<p class="empty-state">No tienes reservas próximas.</p>';
  }

  function renderAdminReservations() {
    if (state.profile?.role !== 'admin') return;
    const today = localDateString();
    const active = state.reservations
      .filter((item) => item.status === 'active' && item.reservation_date >= today)
      .sort((a, b) => a.reservation_date.localeCompare(b.reservation_date) || a.start_time.localeCompare(b.start_time));
    elements.adminBookingsList.innerHTML = active.length
      ? active.map((item) => reservationCard(item, true)).join('')
      : '<p class="empty-state">No hay reservas activas.</p>';
  }

  function renderSession() {
    const loggedIn = Boolean(state.session && state.profile);
    elements.userView.hidden = !loggedIn;
    elements.reservationBoard.hidden = !loggedIn;
    elements.adminPanel.hidden = !loggedIn || state.profile?.role !== 'admin';
    if (!loggedIn) return;
    elements.currentUserName.textContent = state.profile.full_name;
    renderMyReservations();
    renderAdminReservations();
  }

  async function loadRooms() {
    const { data, error } = await state.client.from('classrooms').select('id,code,name').eq('active', true).order('sort_order');
    if (error) throw error;
    if (data?.length) state.rooms = data;
    populateRoomSelects();
  }

  async function loadFixedOccupancies() {
    const { data, error } = await state.client
      .from('fixed_occupancies')
      .select('id,day_of_week,start_time,end_time,label,classrooms(code)')
      .order('day_of_week')
      .order('start_time');
    if (error) throw error;
    state.fixedOccupancies = data || [];
  }

  async function loadReservations() {
    const { data, error } = await state.client
      .from('reservations')
      .select('id,user_id,classroom_id,reservation_date,start_time,end_time,activity,professor_name,status,created_at,classrooms(code,name)')
      .gte('reservation_date', cycleStart)
      .lte('reservation_date', cycleEnd)
      .eq('status', 'active')
      .order('reservation_date')
      .order('start_time');
    if (error) throw error;
    state.reservations = data || [];
    renderPublicReservations();
    renderMyReservations();
    renderAdminReservations();
    updateAvailability();
  }

  async function loadProfile() {
    if (!state.session) {
      state.profile = null;
      renderSession();
      return;
    }
    const { data, error } = await state.client
      .from('profiles')
      .select('id,full_name,email,role,active')
      .eq('id', state.session.user.id)
      .single();
    if (error) throw error;
    if (!data.active) {
      await state.client.auth.signOut();
      throw new Error('Esta cuenta está desactivada. Contacta a la administración.');
    }
    state.profile = data;
    renderSession();
  }

  async function signOut() {
    clearMessage();
    await state.client.auth.signOut();
    window.location.replace('ingreso.html');
  }

  async function saveReservation(event) {
    event.preventDefault();
    clearMessage();
    const slot = {
      room: elements.bookingRoom.value,
      date: elements.bookingDate.value,
      start: elements.bookingStart.value,
      end: elements.bookingEnd.value
    };
    const validation = validateSlot(slot);
    if (!validation.ok) {
      showMessage(validation.message, 'error');
      return;
    }
    const room = state.rooms.find((item) => item.code === slot.room);
    if (!room?.id) {
      showMessage('No se encontró el aula seleccionada en la base de datos.', 'error');
      return;
    }
    setBusy(elements.saveBookingButton, true, 'Guardando…');
    try {
      const { error } = await state.client.from('reservations').insert({
        user_id: state.session.user.id,
        classroom_id: room.id,
        reservation_date: slot.date,
        start_time: slot.start,
        end_time: slot.end,
        activity: elements.bookingActivity.value.trim(),
        professor_name: state.profile.full_name
      });
      if (error) throw error;
      elements.bookingForm.reset();
      elements.bookingDate.value = initialDate();
      elements.bookingStart.value = '08:00';
      elements.bookingEnd.value = '09:00';
      await loadReservations();
      showMessage('Reserva guardada correctamente.');
    } catch (error) {
      const conflict = error.code === '23P01' || /conflict|exclusion/i.test(error.message || '');
      showMessage(conflict ? 'El aula acaba de ser reservada en ese horario. Selecciona otro espacio.' : error.message, 'error');
    } finally {
      setBusy(elements.saveBookingButton, false);
      updateAvailability();
    }
  }

  async function cancelReservation(id) {
    if (!window.confirm('¿Deseas cancelar esta reserva?')) return;
    clearMessage();
    const { error } = await state.client.from('reservations').update({ status: 'cancelled' }).eq('id', id);
    if (error) {
      showMessage(error.message, 'error');
      return;
    }
    await loadReservations();
    showMessage('La reserva fue cancelada.');
  }

  async function createUser(event) {
    event.preventDefault();
    clearMessage();
    const button = elements.createUserForm.querySelector('button[type="submit"]');
    setBusy(button, true, 'Creando…');
    const form = new FormData(elements.createUserForm);
    const email = String(form.get('email')).trim().toLowerCase();
    if (!/^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+@una\.cr$/.test(email)) {
      showMessage('El correo debe tener el formato nombre.apellido.apellido@una.cr.', 'error');
      setBusy(button, false);
      return;
    }
    try {
      const { data, error } = await state.client.functions.invoke('admin-create-user', {
        body: {
          fullName: String(form.get('name')).trim(),
          email,
          password: String(form.get('password')),
          role: String(form.get('role'))
        }
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No fue posible crear la cuenta.');
      elements.createUserForm.reset();
      showMessage('Cuenta creada correctamente. Ya puede iniciar sesión.');
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  }

  function bindEvents() {
    elements.logoutButton.addEventListener('click', signOut);
    elements.bookingForm.addEventListener('submit', saveReservation);
    elements.createUserForm.addEventListener('submit', createUser);
    elements.refreshButton.addEventListener('click', async () => {
      await loadReservations();
      showMessage('Reservas actualizadas.');
    });
    [elements.bookingDate, elements.bookingRoom, elements.bookingStart, elements.bookingEnd].forEach((control) => {
      control.addEventListener('change', updateAvailability);
      control.addEventListener('input', updateAvailability);
    });
    elements.boardDate.addEventListener('change', renderPublicReservations);
    elements.boardRoom.addEventListener('change', renderPublicReservations);
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cancel-reservation]');
      if (button) cancelReservation(button.dataset.cancelReservation);
    });
  }

  async function initialize() {
    elements.bookingDate.min = cycleStart;
    elements.bookingDate.max = cycleEnd;
    elements.boardDate.min = cycleStart;
    elements.boardDate.max = cycleEnd;
    elements.bookingDate.value = initialDate();
    elements.boardDate.value = initialDate();
    elements.bookingStart.value = '08:00';
    elements.bookingEnd.value = '09:00';
    populateRoomSelects();
    bindEvents();

    if (!isConfigured || !window.supabase?.createClient) {
      elements.connectionStatus.textContent = 'Configuración pendiente';
      elements.connectionStatus.classList.add('is-offline');
      elements.saveBookingButton.disabled = true;
      showMessage('El sistema está instalado. Falta conectar las credenciales públicas del proyecto de Supabase.', 'error');
      return;
    }

    try {
      state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      elements.connectionStatus.textContent = 'Sistema disponible';
      await loadRooms();
      await loadFixedOccupancies();
      const { data } = await state.client.auth.getSession();
      state.session = data.session;
      if (!state.session) {
        window.location.replace('ingreso.html');
        return;
      }
      await loadProfile();
      await loadReservations();
      state.client.auth.onAuthStateChange(async (_event, session) => {
        state.session = session;
        if (session) await loadProfile();
        else window.location.replace('ingreso.html');
      });
    } catch (error) {
      elements.connectionStatus.textContent = 'Conexión no disponible';
      elements.connectionStatus.classList.add('is-offline');
      showMessage(`No fue posible conectar con el sistema: ${error.message}`, 'error');
    }
  }

  initialize();
})();
