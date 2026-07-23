(() => {
  'use strict';

  const config = window.RESERVAS_CONFIG || {};
  const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const roomCodes = ['L601', 'L602', 'L603', '708', '709', '710', '711'];
  const dayNames = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SET', 'OCT', 'NOV', 'DIC'];
  const dayMap = { DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, MIÉRCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6, SÁBADO: 6 };
  const teacherEmailPattern = /^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+@una\.cr$/;
  const strongPasswordPattern = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

  const byId = (id) => document.getElementById(id);
  const elements = {
    connectionStatus: byId('connectionStatus'), systemMessage: byId('systemMessage'), userView: byId('userView'),
    headerAccount: byId('headerAccount'),
    logoutButton: byId('logoutButton'), currentUserName: byId('currentUserName'), bookingForm: byId('bookingForm'),
    bookingDate: byId('bookingDate'), bookingRoom: byId('bookingRoom'), bookingStart: byId('bookingStart'),
    bookingEnd: byId('bookingEnd'), bookingActivity: byId('bookingActivity'), availabilityCheck: byId('availabilityCheck'),
    saveBookingButton: byId('saveBookingButton'), refreshButton: byId('refreshButton'), myBookingsList: byId('myBookingsList'),
    boardDate: byId('boardDate'), boardRoom: byId('boardRoom'), availabilityBoard: byId('availabilityBoard'),
    publicReservationsList: byId('publicReservationsList'), reservationBoard: byId('reservationBoard'),
    adminPanel: byId('adminPanel'), createUserForm: byId('createUserForm'), adminBookingsList: byId('adminBookingsList'),
    cycleBanner: byId('cycleBanner'), cycleName: byId('cycleName'), cycleDates: byId('cycleDates'), cycleState: byId('cycleState'),
    cycleDescription: byId('cycleDescription'), adminCycleState: byId('adminCycleState'), cycleForm: byId('cycleForm'),
    adminCycleName: byId('adminCycleName'), adminReservationStart: byId('adminReservationStart'),
    adminReservationEnd: byId('adminReservationEnd'), adminAcademicEnd: byId('adminAcademicEnd'),
    adminOpensAt: byId('adminOpensAt'), adminClosesAt: byId('adminClosesAt'), scheduleStatus: byId('scheduleStatus'),
    scheduleFile: byId('scheduleFile'), uploadScheduleButton: byId('uploadScheduleButton'),
    toggleReservationsButton: byId('toggleReservationsButton'), cycleActionHelp: byId('cycleActionHelp'),
    changePasswordForm: byId('changePasswordForm'), newPassword: byId('newPassword'), confirmPassword: byId('confirmPassword'),
    usersFile: byId('usersFile'), usersFileSummary: byId('usersFileSummary'), uploadUsersButton: byId('uploadUsersButton')
  };

  const state = {
    client: null, session: null, profile: null, cycle: null,
    rooms: roomCodes.map((code) => ({ id: null, code, name: `Aula ${code}` })),
    fixedOccupancies: [], reservations: []
  };

  function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function showMessage(message, type = 'success') {
    elements.systemMessage.textContent = message;
    elements.systemMessage.classList.toggle('is-error', type === 'error');
    elements.systemMessage.hidden = false;
  }
  function clearMessage() { elements.systemMessage.hidden = true; elements.systemMessage.textContent = ''; elements.systemMessage.classList.remove('is-error'); }
  function setBusy(button, busy, busyText = 'Procesando…') {
    if (!button) return;
    if (busy) { button.dataset.label = button.textContent; button.textContent = busyText; button.disabled = true; }
    else { button.textContent = button.dataset.label || button.textContent; button.disabled = false; }
  }
  function localDateString(date = new Date()) { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10); }
  function normalizeTime(value) { return String(value || '').slice(0, 5); }
  function normalizeHeader(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, '_');
  }
  function normalizeClock(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return '';
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  function formatDate(value) { return new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
  function formatDateTime(value) { return new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  function dayName(dateString) { return dayNames[new Date(`${dateString}T12:00:00`).getDay()]; }
  function overlaps(startA, endA, startB, endB) { return normalizeTime(startA) < normalizeTime(endB) && normalizeTime(endA) > normalizeTime(startB); }
  function dateTimeLocal(value) { if (!value) return ''; const date = new Date(value); const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16); }

  function cycleIsOpen() {
    if (!state.cycle || !state.cycle.reservations_enabled || !state.cycle.academic_schedule_loaded) return false;
    const now = Date.now();
    return now >= new Date(state.cycle.booking_opens_at).getTime() && now <= new Date(state.cycle.booking_closes_at).getTime();
  }

  function initialDate() {
    if (!state.cycle) return localDateString();
    const today = localDateString();
    if (today < state.cycle.reservation_start_date) return state.cycle.reservation_start_date;
    if (today > state.cycle.reservation_end_date) return state.cycle.reservation_end_date;
    return today;
  }

  function setCycleStateBadge(element, label, className) {
    element.textContent = label;
    element.classList.remove('is-open', 'is-closed', 'is-waiting');
    element.classList.add(className);
  }

  function renderCycle() {
    const cycle = state.cycle;
    elements.cycleBanner.hidden = !cycle;
    if (!cycle) { elements.saveBookingButton.disabled = true; return; }
    const open = cycleIsOpen();
    const waiting = cycle.reservations_enabled && !open;
    elements.cycleName.textContent = cycle.name;
    elements.cycleDates.textContent = `Reservas para fechas del ${formatDate(cycle.reservation_start_date)} al ${formatDate(cycle.reservation_end_date)}.`;
    elements.cycleDescription.textContent = open
      ? `Sistema habilitado hasta el ${formatDateTime(cycle.booking_closes_at)}.`
      : 'La consulta continúa disponible. Solo la administración puede habilitar nuevas reservas.';
    setCycleStateBadge(elements.cycleState, open ? 'Reservas abiertas' : waiting ? 'Fuera de horario' : 'Reservas cerradas', open ? 'is-open' : waiting ? 'is-waiting' : 'is-closed');

    [elements.bookingDate, elements.boardDate].forEach((input) => { input.min = cycle.reservation_start_date; input.max = cycle.reservation_end_date; });
    if (!elements.bookingDate.value || elements.bookingDate.value < cycle.reservation_start_date || elements.bookingDate.value > cycle.reservation_end_date) elements.bookingDate.value = initialDate();
    if (!elements.boardDate.value || elements.boardDate.value < cycle.reservation_start_date || elements.boardDate.value > cycle.reservation_end_date) elements.boardDate.value = initialDate();

    if (state.profile?.role === 'admin') {
      elements.adminCycleName.value = cycle.name;
      elements.adminReservationStart.value = cycle.reservation_start_date;
      elements.adminReservationEnd.value = cycle.reservation_end_date;
      elements.adminAcademicEnd.value = cycle.academic_schedule_end_date;
      elements.adminOpensAt.value = dateTimeLocal(cycle.booking_opens_at);
      elements.adminClosesAt.value = dateTimeLocal(cycle.booking_closes_at);
      elements.scheduleStatus.textContent = cycle.academic_schedule_loaded
        ? 'Horario académico cargado. Las clases tienen prioridad sobre cualquier reserva.'
        : 'Aún no se ha cargado para este ciclo.';
      setCycleStateBadge(elements.adminCycleState, open ? 'Abierto' : 'Cerrado', open ? 'is-open' : 'is-closed');
      elements.toggleReservationsButton.textContent = cycle.reservations_enabled ? 'Cerrar reservas' : 'Abrir reservas';
      elements.toggleReservationsButton.disabled = !cycle.academic_schedule_loaded;
      elements.cycleActionHelp.textContent = cycle.academic_schedule_loaded
        ? `Ventana configurada: ${formatDateTime(cycle.booking_opens_at)} a ${formatDateTime(cycle.booking_closes_at)}.`
        : 'Carga primero la ocupación académica; el sistema no permite abrir las reservas sin ella.';
    }
    updateAvailability();
  }

  function baseConflict(roomCode, date, start, end) {
    if (!state.cycle || date > state.cycle.academic_schedule_end_date) return null;
    const selectedDay = new Date(`${date}T12:00:00`).getDay();
    return state.fixedOccupancies.find((record) => record.classrooms?.code === roomCode && record.day_of_week === selectedDay && overlaps(start, end, record.start_time, record.end_time));
  }
  function reservationConflict(roomCode, date, start, end) {
    return state.reservations.find((item) => item.status === 'active' && item.reservation_date === date && item.classrooms?.code === roomCode && overlaps(start, end, item.start_time, item.end_time));
  }
  function validateSlot({ room, date, start, end }) {
    if (!state.cycle) return { ok: false, message: 'La administración aún no ha configurado el ciclo.' };
    if (!cycleIsOpen()) return { ok: false, message: 'Las reservas están cerradas por la administración.' };
    if (!room || !date || !start || !end) return { ok: false, message: 'Completa la fecha, el aula y las dos horas.' };
    if (date < state.cycle.reservation_start_date || date > state.cycle.reservation_end_date) return { ok: false, message: `La fecha debe estar entre ${formatDate(state.cycle.reservation_start_date)} y ${formatDate(state.cycle.reservation_end_date)}.` };
    if (date < localDateString()) return { ok: false, message: 'No se permiten reservas en fechas pasadas.' };
    if (dayName(date) === 'DOMINGO') return { ok: false, message: 'No se permiten reservas los domingos.' };
    if (start >= end) return { ok: false, message: 'La hora de finalización debe ser posterior a la hora de inicio.' };
    if (start < '07:00' || end > '21:00') return { ok: false, message: 'Las reservas deben realizarse entre las 07:00 y las 21:00.' };
    const fixed = baseConflict(room, date, start, end);
    if (fixed) return { ok: false, message: `El aula tiene una clase prioritaria de ${normalizeTime(fixed.start_time)} a ${normalizeTime(fixed.end_time)}: ${fixed.label}.` };
    const reserved = reservationConflict(room, date, start, end);
    if (reserved) return { ok: false, message: `Ya existe una reserva de ${normalizeTime(reserved.start_time)} a ${normalizeTime(reserved.end_time)}.` };
    return { ok: true, message: 'Horario disponible. Puedes guardar la reserva.' };
  }
  function updateAvailability() {
    const result = validateSlot({ room: elements.bookingRoom.value, date: elements.bookingDate.value, start: elements.bookingStart.value, end: elements.bookingEnd.value });
    elements.availabilityCheck.textContent = result.message;
    elements.availabilityCheck.classList.toggle('is-available', result.ok);
    elements.availabilityCheck.classList.toggle('is-conflict', !result.ok && Boolean(elements.bookingStart.value && elements.bookingEnd.value));
    elements.saveBookingButton.disabled = !result.ok || !isConfigured;
    return result;
  }

  function roomOptions(all = false) { return (all ? '<option value="TODAS">Todas</option>' : '<option value="">Selecciona un aula</option>') + state.rooms.map((room) => `<option value="${escapeHtml(room.code)}">Aula ${escapeHtml(room.code)}</option>`).join(''); }
  function populateRoomSelects() { elements.bookingRoom.innerHTML = roomOptions(); elements.boardRoom.innerHTML = roomOptions(true); }
  function dateBadge(value) { const date = new Date(`${value}T12:00:00`); return `<span class="booking-date"><strong>${String(date.getDate()).padStart(2, '0')}</strong><span>${monthNames[date.getMonth()]}</span></span>`; }
  function reservationCard(item, controls = false) {
    const canCancel = controls && (state.profile?.role === 'admin' || item.user_id === state.session?.user?.id);
    const action = canCancel ? `<button class="danger-button" type="button" data-cancel-reservation="${escapeHtml(item.id)}">Cancelar</button>` : `<span class="reservation-time">${normalizeTime(item.start_time)}–${normalizeTime(item.end_time)}</span>`;
    return `<article class="${controls ? 'booking-item' : 'reservation-item'}">${controls ? dateBadge(item.reservation_date) : `<span class="room-pill">${escapeHtml(item.classrooms?.code || 'Aula')}</span>`}<div class="booking-copy"><strong>${escapeHtml(item.activity)}</strong><span>${controls ? `Aula ${escapeHtml(item.classrooms?.code)} · ` : `${escapeHtml(item.professor_name)} · `}${normalizeTime(item.start_time)}–${normalizeTime(item.end_time)}${controls ? '' : ` · ${formatDate(item.reservation_date)}`}</span></div>${action}</article>`;
  }
  function timeToMinutes(time) { const [hours, minutes] = normalizeTime(time).split(':').map(Number); return hours * 60 + minutes; }
  function minutesToTime(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
  function occupiedIntervals(roomCode, date) {
    const selectedDay = new Date(`${date}T12:00:00`).getDay();
    const fixed = state.cycle && date <= state.cycle.academic_schedule_end_date ? state.fixedOccupancies.filter((item) => item.classrooms?.code === roomCode && item.day_of_week === selectedDay).map((item) => ({ start: timeToMinutes(item.start_time), end: timeToMinutes(item.end_time), label: item.label })) : [];
    const reserved = state.reservations.filter((item) => item.status === 'active' && item.reservation_date === date && item.classrooms?.code === roomCode).map((item) => ({ start: timeToMinutes(item.start_time), end: timeToMinutes(item.end_time), label: item.activity }));
    return [...fixed, ...reserved].sort((a, b) => a.start - b.start || a.end - b.end);
  }
  function timelineForRoom(roomCode, date) {
    const opening = 420, closing = 1260, merged = [];
    occupiedIntervals(roomCode, date).forEach((slot) => {
      const start = Math.max(opening, slot.start), end = Math.min(closing, slot.end);
      if (end <= opening || start >= closing) return;
      const previous = merged.at(-1);
      if (previous && start <= previous.end) { previous.end = Math.max(previous.end, end); previous.labels.push(slot.label); }
      else merged.push({ start, end, labels: [slot.label] });
    });
    const timeline = []; let cursor = opening;
    merged.forEach((slot) => { if (cursor < slot.start) timeline.push({ start: cursor, end: slot.start, free: true, label: 'Disponible' }); timeline.push({ start: slot.start, end: slot.end, free: false, label: [...new Set(slot.labels)].join(' · ') }); cursor = Math.max(cursor, slot.end); });
    if (cursor < closing) timeline.push({ start: cursor, end: closing, free: true, label: 'Disponible' });
    return timeline;
  }
  function renderAvailability() {
    if (!elements.boardDate.value) return;
    const selectedRoom = elements.boardRoom.value;
    const rooms = selectedRoom === 'TODAS' ? state.rooms : state.rooms.filter((room) => room.code === selectedRoom);
    elements.availabilityBoard.innerHTML = rooms.map((room) => `<article class="availability-room"><h3>Aula ${escapeHtml(room.code)}</h3><div class="availability-slots">${timelineForRoom(room.code, elements.boardDate.value).map((slot) => slot.free
      ? `<button class="availability-slot is-free" type="button" data-reserve-room="${escapeHtml(room.code)}" data-reserve-start="${minutesToTime(slot.start)}" data-reserve-end="${minutesToTime(slot.end)}">${minutesToTime(slot.start)}–${minutesToTime(slot.end)} · Reservar</button>`
      : `<span class="availability-slot is-busy" title="${escapeHtml(slot.label)}">${minutesToTime(slot.start)}–${minutesToTime(slot.end)} · Ocupado</span>`).join('')}</div></article>`).join('');
  }
  function selectAvailableSlot(button) {
    elements.bookingDate.value = elements.boardDate.value;
    elements.bookingRoom.value = button.dataset.reserveRoom;
    elements.bookingStart.value = button.dataset.reserveStart;
    elements.bookingEnd.value = button.dataset.reserveEnd;
    updateAvailability();
    elements.bookingForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => elements.bookingActivity.focus(), 450);
  }
  function renderPublicReservations() {
    const date = elements.boardDate.value, room = elements.boardRoom.value;
    const list = state.reservations.filter((item) => item.status === 'active' && item.reservation_date === date && (room === 'TODAS' || item.classrooms?.code === room)).sort((a, b) => a.start_time.localeCompare(b.start_time));
    elements.publicReservationsList.innerHTML = list.length ? list.map((item) => reservationCard(item)).join('') : '<p class="empty-state">No hay reservas registradas para esta fecha.</p>';
    renderAvailability();
  }
  function renderMyReservations() {
    if (!state.session) return;
    const list = state.reservations.filter((item) => item.status === 'active' && item.user_id === state.session.user.id && item.reservation_date >= localDateString()).sort((a, b) => a.reservation_date.localeCompare(b.reservation_date) || a.start_time.localeCompare(b.start_time));
    elements.myBookingsList.innerHTML = list.length ? list.map((item) => reservationCard(item, true)).join('') : '<p class="empty-state">No tienes reservas próximas.</p>';
  }
  function renderAdminReservations() {
    if (state.profile?.role !== 'admin') return;
    const list = state.reservations.filter((item) => item.status === 'active' && item.reservation_date >= localDateString()).sort((a, b) => a.reservation_date.localeCompare(b.reservation_date) || a.start_time.localeCompare(b.start_time));
    elements.adminBookingsList.innerHTML = list.length ? list.map((item) => reservationCard(item, true)).join('') : '<p class="empty-state">No hay reservas activas.</p>';
  }
  function renderSession() {
    const loggedIn = Boolean(state.session && state.profile);
    elements.headerAccount.hidden = !loggedIn;
    elements.userView.hidden = !loggedIn; elements.reservationBoard.hidden = !loggedIn; elements.adminPanel.hidden = !loggedIn || state.profile?.role !== 'admin';
    if (!loggedIn) return;
    elements.currentUserName.textContent = state.profile.full_name;
    renderCycle(); renderMyReservations(); renderAdminReservations();
  }

  async function loadRooms() { const { data, error } = await state.client.from('classrooms').select('id,code,name').eq('active', true).order('sort_order'); if (error) throw error; if (data?.length) state.rooms = data; populateRoomSelects(); }
  async function loadCycle() {
    const { data, error } = await state.client.from('reservation_cycles').select('*').eq('is_current', true).maybeSingle();
    if (error) throw error;
    state.cycle = data || null; renderCycle();
  }
  async function loadFixedOccupancies() {
    if (!state.cycle) { state.fixedOccupancies = []; return; }
    const { data, error } = await state.client.from('fixed_occupancies').select('id,day_of_week,start_time,end_time,label,classrooms(code)').eq('cycle_id', state.cycle.id).order('day_of_week').order('start_time');
    if (error) throw error; state.fixedOccupancies = data || [];
  }
  async function loadReservations() {
    if (!state.cycle) { state.reservations = []; return; }
    const { data, error } = await state.client.from('reservations').select('id,user_id,classroom_id,reservation_date,start_time,end_time,activity,professor_name,status,created_at,classrooms(code,name)').eq('cycle_id', state.cycle.id).eq('status', 'active').order('reservation_date').order('start_time');
    if (error) throw error; state.reservations = data || []; renderPublicReservations(); renderMyReservations(); renderAdminReservations(); updateAvailability();
  }
  async function loadProfile() {
    if (!state.session) { state.profile = null; renderSession(); return; }
    const { data, error } = await state.client.from('profiles').select('id,full_name,email,role,active').eq('id', state.session.user.id).single();
    if (error) throw error;
    if (!data.active) { await state.client.auth.signOut(); throw new Error('Esta cuenta está desactivada. Contacta a la administración.'); }
    state.profile = data; renderSession();
  }
  async function reloadAll() { await loadCycle(); await loadFixedOccupancies(); await loadReservations(); }
  async function signOut() { clearMessage(); await state.client.auth.signOut(); window.location.replace('ingreso.html'); }

  async function saveReservation(event) {
    event.preventDefault(); clearMessage();
    const slot = { room: elements.bookingRoom.value, date: elements.bookingDate.value, start: elements.bookingStart.value, end: elements.bookingEnd.value };
    const validation = validateSlot(slot); if (!validation.ok) { showMessage(validation.message, 'error'); return; }
    const room = state.rooms.find((item) => item.code === slot.room); if (!room?.id) { showMessage('No se encontró el aula seleccionada.', 'error'); return; }
    setBusy(elements.saveBookingButton, true, 'Guardando…');
    try {
      const { error } = await state.client.from('reservations').insert({ cycle_id: state.cycle.id, user_id: state.session.user.id, classroom_id: room.id, reservation_date: slot.date, start_time: slot.start, end_time: slot.end, activity: elements.bookingActivity.value.trim(), professor_name: state.profile.full_name });
      if (error) throw error;
      elements.bookingForm.reset(); elements.bookingDate.value = initialDate(); elements.bookingStart.value = '08:00'; elements.bookingEnd.value = '09:00'; await loadReservations(); showMessage('Reserva guardada correctamente.');
    } catch (error) { showMessage(error.code === '23P01' ? 'El aula ya está ocupada en ese horario.' : error.message, 'error'); }
    finally { setBusy(elements.saveBookingButton, false); updateAvailability(); }
  }
  async function cancelReservation(id) { if (!window.confirm('¿Deseas cancelar esta reserva?')) return; clearMessage(); const { error } = await state.client.from('reservations').update({ status: 'cancelled' }).eq('id', id); if (error) return showMessage(error.message, 'error'); await loadReservations(); showMessage('La reserva fue cancelada.'); }
  async function changePassword(event) {
    event.preventDefault(); clearMessage();
    const password = elements.newPassword.value;
    if (!strongPasswordPattern.test(password)) return showMessage('La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.', 'error');
    if (password !== elements.confirmPassword.value) return showMessage('Las contraseñas no coinciden.', 'error');
    const button = elements.changePasswordForm.querySelector('button[type="submit"]');
    setBusy(button, true, 'Actualizando…');
    try {
      const { error } = await state.client.auth.updateUser({ password });
      if (error) throw error;
      elements.changePasswordForm.reset();
      showMessage('Contraseña actualizada correctamente.');
    } catch (error) { showMessage(error.message, 'error'); }
    finally { setBusy(button, false); }
  }
  async function createUser(event) {
    event.preventDefault(); clearMessage(); const button = elements.createUserForm.querySelector('button[type="submit"]'); setBusy(button, true, 'Creando…');
    const form = new FormData(elements.createUserForm), email = String(form.get('email')).trim().toLowerCase(), password = String(form.get('password'));
    if (!teacherEmailPattern.test(email)) { showMessage('El correo debe tener el formato nombre.apellido.apellido@una.cr.', 'error'); setBusy(button, false); return; }
    if (!strongPasswordPattern.test(password)) { showMessage('La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.', 'error'); setBusy(button, false); return; }
    try { const { data, error } = await state.client.functions.invoke('admin-create-user', { body: { fullName: String(form.get('name')).trim(), email, password, role: String(form.get('role')) } }); if (error) throw error; if (!data?.ok) throw new Error(data?.error || 'No fue posible crear la cuenta.'); elements.createUserForm.reset(); showMessage('Cuenta creada correctamente.'); }
    catch (error) { showMessage(error.message, 'error'); } finally { setBusy(button, false); }
  }

  async function workbookRows(file) {
    if (!window.XLSX) throw new Error('No fue posible cargar el lector de Excel. Recarga la página e inténtalo de nuevo.');
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) throw new Error('El archivo de Excel no contiene hojas.');
    return window.XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
  }

  async function parseTeacherWorkbook(file) {
    const rows = await workbookRows(file);
    if (!rows.length) throw new Error('El archivo no contiene cuentas para crear.');
    const seen = new Set();
    return rows.map((source, index) => {
      const row = Object.fromEntries(Object.entries(source).map(([key, value]) => [normalizeHeader(key), String(value).trim()]));
      const fullName = row.nombre_completo || row.nombre || '';
      const email = (row.correo_electronico || row.correo || row.email || '').toLowerCase();
      const password = row.contrasena_temporal || row.contrasena || '';
      if (fullName.length < 3) throw new Error(`Revisa el nombre completo en la fila ${index + 2}.`);
      if (!teacherEmailPattern.test(email)) throw new Error(`Revisa el correo institucional en la fila ${index + 2}.`);
      if (password && !strongPasswordPattern.test(password)) throw new Error(`La contraseña de la fila ${index + 2} debe tener 8 caracteres, una mayúscula y un número.`);
      if (seen.has(email)) throw new Error(`El correo ${email} está repetido en el archivo.`);
      seen.add(email);
      return { fullName, email, password, role: 'teacher' };
    });
  }

  async function uploadUsers() {
    clearMessage();
    const file = elements.usersFile.files[0];
    if (!file) return showMessage('Selecciona primero el archivo de cuentas docentes.', 'error');
    setBusy(elements.uploadUsersButton, true, 'Creando cuentas…');
    try {
      const users = await parseTeacherWorkbook(file);
      const { data, error } = await state.client.functions.invoke('admin-create-user', { body: { users } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No fue posible procesar las cuentas.');
      const failures = (data.results || []).filter((result) => !result.ok);
      elements.usersFileSummary.textContent = `${data.createdCount || 0} cuentas creadas${failures.length ? `; ${failures.length} no se pudieron crear` : ''}.`;
      const authorized = data.authorizedCount || 0;
      showMessage(failures.length ? `Carga finalizada con observaciones: ${failures.map((item) => `${item.email}: ${item.error}`).join(' · ')}` : `Carga finalizada: ${data.createdCount || 0} cuentas creadas y ${authorized} docentes autorizados para registrarse.`, failures.length ? 'error' : 'success');
    } catch (error) { showMessage(error.message, 'error'); }
    finally { setBusy(elements.uploadUsersButton, false); }
  }

  async function configureCycle(event) {
    event.preventDefault(); clearMessage(); const button = elements.cycleForm.querySelector('button[type="submit"]'); setBusy(button, true, 'Guardando…');
    const form = new FormData(elements.cycleForm);
    try {
      const { error } = await state.client.rpc('admin_configure_cycle', { p_name: String(form.get('name')).trim(), p_reservation_start: form.get('reservationStart'), p_reservation_end: form.get('reservationEnd'), p_academic_end: form.get('academicEnd'), p_opens_at: new Date(String(form.get('opensAt'))).toISOString(), p_closes_at: new Date(String(form.get('closesAt'))).toISOString() });
      if (error) throw error; await reloadAll(); showMessage('Ciclo configurado. Permanece cerrado hasta cargar la ocupación y abrirlo manualmente.');
    } catch (error) { showMessage(error.message, 'error'); } finally { setBusy(button, false); }
  }

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error('El archivo no contiene registros.');
    const separator = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(separator).map((item) => item.trim().toLowerCase());
    const required = ['aula', 'dia', 'hora_inicio', 'hora_fin', 'detalle'];
    if (required.some((name) => !headers.includes(name))) throw new Error(`La plantilla debe incluir: ${required.join(', ')}.`);
    return lines.slice(1).map((line, index) => {
      const values = line.split(separator).map((item) => item.trim()); const row = Object.fromEntries(headers.map((key, i) => [key, values[i] || '']));
      const dayKey = row.dia.toUpperCase(); const day = /^\d$/.test(dayKey) ? Number(dayKey) : dayMap[dayKey];
      if (!roomCodes.includes(row.aula) || !Number.isInteger(day) || day < 1 || day > 6 || !/^\d{2}:\d{2}$/.test(row.hora_inicio) || !/^\d{2}:\d{2}$/.test(row.hora_fin) || !row.detalle) throw new Error(`Revisa la fila ${index + 2} del archivo.`);
      return { aula: row.aula, dia: day, hora_inicio: row.hora_inicio, hora_fin: row.hora_fin, detalle: row.detalle };
    });
  }
  async function parseScheduleFile(file) {
    if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
    const rows = await workbookRows(file);
    if (!rows.length) throw new Error('El archivo no contiene registros de ocupación.');
    return rows.map((source, index) => {
      const row = Object.fromEntries(Object.entries(source).map(([key, value]) => [normalizeHeader(key), String(value).trim()]));
      const room = row.aula || '';
      const dayKey = String(row.dia || '').toUpperCase();
      const day = /^\d$/.test(dayKey) ? Number(dayKey) : dayMap[dayKey];
      const start = normalizeClock(row.hora_inicio);
      const end = normalizeClock(row.hora_fin);
      const detail = row.detalle || '';
      if (!roomCodes.includes(room) || !Number.isInteger(day) || day < 1 || day > 6 || !start || !end || start >= end || !detail) {
        throw new Error(`Revisa la fila ${index + 2} del archivo de ocupación.`);
      }
      return { aula: room, dia: day, hora_inicio: start, hora_fin: end, detalle: detail };
    });
  }
  async function uploadSchedule() {
    clearMessage(); const file = elements.scheduleFile.files[0]; if (!file) return showMessage('Selecciona primero el archivo de ocupación.', 'error');
    setBusy(elements.uploadScheduleButton, true, 'Cargando…');
    try { const entries = await parseScheduleFile(file); const { data, error } = await state.client.rpc('admin_replace_fixed_occupancies', { p_entries: entries }); if (error) throw error; await reloadAll(); showMessage(`Ocupación académica cargada: ${data} registros. Las reservas permanecen cerradas.`); }
    catch (error) { showMessage(error.message, 'error'); } finally { setBusy(elements.uploadScheduleButton, false); }
  }
  async function toggleReservations() {
    clearMessage(); const enable = !state.cycle?.reservations_enabled; setBusy(elements.toggleReservationsButton, true, enable ? 'Abriendo…' : 'Cerrando…');
    try { const { error } = await state.client.rpc('admin_set_reservations_enabled', { p_enabled: enable }); if (error) throw error; await reloadAll(); showMessage(enable ? 'Reservas habilitadas para el ciclo vigente.' : 'Reservas cerradas. No se aceptarán nuevos registros.'); }
    catch (error) { showMessage(error.message, 'error'); } finally { setBusy(elements.toggleReservationsButton, false); renderCycle(); }
  }

  function bindEvents() {
    elements.logoutButton.addEventListener('click', signOut); elements.bookingForm.addEventListener('submit', saveReservation); elements.createUserForm.addEventListener('submit', createUser); elements.cycleForm.addEventListener('submit', configureCycle);
    elements.changePasswordForm.addEventListener('submit', changePassword); elements.uploadUsersButton.addEventListener('click', uploadUsers);
    elements.uploadScheduleButton.addEventListener('click', uploadSchedule); elements.toggleReservationsButton.addEventListener('click', toggleReservations);
    elements.scheduleFile.addEventListener('change', () => { const label = document.querySelector('label[for="scheduleFile"]'); label.textContent = elements.scheduleFile.files[0]?.name || 'Seleccionar Excel'; label.classList.toggle('has-file', Boolean(elements.scheduleFile.files[0])); });
    elements.usersFile.addEventListener('change', async () => {
      const file = elements.usersFile.files[0];
      const label = document.querySelector('label[for="usersFile"]');
      label.textContent = file?.name || 'Seleccionar Excel';
      label.classList.toggle('has-file', Boolean(file));
      if (!file) { elements.usersFileSummary.textContent = 'Ningún archivo seleccionado.'; return; }
      try {
        const users = await parseTeacherWorkbook(file);
        elements.usersFileSummary.textContent = `${users.length} docentes listos para procesar. Las filas sin contraseña quedarán autorizadas para registrarse.`;
      } catch (error) { elements.usersFileSummary.textContent = error.message; }
    });
    elements.refreshButton.addEventListener('click', async () => { await reloadAll(); showMessage('Información actualizada.'); });
    [elements.bookingDate, elements.bookingRoom, elements.bookingStart, elements.bookingEnd].forEach((control) => { control.addEventListener('change', updateAvailability); control.addEventListener('input', updateAvailability); });
    elements.boardDate.addEventListener('change', renderPublicReservations); elements.boardRoom.addEventListener('change', renderPublicReservations);
    document.addEventListener('click', (event) => {
      const cancelButton = event.target.closest('[data-cancel-reservation]');
      if (cancelButton) cancelReservation(cancelButton.dataset.cancelReservation);
      const reserveButton = event.target.closest('[data-reserve-room]');
      if (reserveButton) selectAvailableSlot(reserveButton);
    });
  }

  async function initialize() {
    elements.bookingStart.value = '08:00'; elements.bookingEnd.value = '09:00'; elements.bookingDate.value = localDateString(); elements.boardDate.value = localDateString(); populateRoomSelects(); bindEvents();
    if (!isConfigured || !window.supabase?.createClient) { elements.connectionStatus.textContent = 'Configuración pendiente'; elements.connectionStatus.classList.add('is-offline'); showMessage('El sistema está instalado. Falta conectar el proyecto de Supabase.', 'error'); return; }
    try {
      state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      elements.connectionStatus.textContent = 'Sistema disponible'; const { data } = await state.client.auth.getSession(); state.session = data.session;
      if (!state.session) { window.location.replace('ingreso.html'); return; }
      await loadProfile(); await loadRooms(); await reloadAll();
      state.client.auth.onAuthStateChange(async (_event, session) => { state.session = session; if (session) { await loadProfile(); await reloadAll(); } else window.location.replace('ingreso.html'); });
    } catch (error) { elements.connectionStatus.textContent = 'Conexión no disponible'; elements.connectionStatus.classList.add('is-offline'); showMessage(`No fue posible conectar con el sistema: ${error.message}`, 'error'); }
  }
  initialize();
})();
