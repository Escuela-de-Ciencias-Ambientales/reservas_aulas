(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const config = window.RESERVAS_CONFIG || {};
  const state = {
    client: null, session: null, profile: null, cycle: null, vehicles: [], events: [],
    reservations: [], maintenance: [], services: [], teachers: [], vehicleId: null,
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), loaded: false
  };
  const categories = { oil_change: 'Cambio de aceite', minor_repair: 'Reparación menor', major_repair: 'Reparación mayor' };
  const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const isAdmin = () => state.profile?.role === 'admin';
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const pad = (value) => String(value).padStart(2, '0');
  const localDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const localDateTime = (date) => `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const formatDateTime = (value) => new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const formatTime = (value) => new Intl.DateTimeFormat('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  const vehicleImage = (value = '') => String(value).replace(/\.webp$/i, '.jpg');

  function setMessage(element, text, success = false) {
    if (!element) return;
    element.textContent = text;
    element.hidden = !text;
    element.classList.toggle('is-success', success);
  }

  function reservationsOpen() {
    if (!state.cycle?.reservations_enabled) return false;
    const now = new Date();
    return now >= new Date(state.cycle.booking_opens_at) && now <= new Date(state.cycle.booking_closes_at);
  }

  function setModule(module) {
    const vehicles = module === 'vehicles';
    $('classroomPrivateModule').hidden = vehicles;
    $('vehiclePrivateModule').hidden = !vehicles;
    $('showPrivateClassrooms').setAttribute('aria-selected', String(!vehicles));
    $('showPrivateVehicles').setAttribute('aria-selected', String(vehicles));
    if (vehicles && !state.loaded) loadVehicleModule();
  }

  function monthBounds() {
    return {
      from: new Date(state.month.getFullYear(), state.month.getMonth(), 1),
      to: new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0)
    };
  }

  function renderVehicleOptions() {
    const options = state.vehicles.map((vehicle) =>
      `<option value="${vehicle.id}">${escapeHtml(vehicle.plate)} · ${escapeHtml(vehicle.display_name)}</option>`
    ).join('');
    ['privateVehicleSelect', 'vehicleBookingVehicle', 'maintenanceVehicle', 'serviceVehicle'].forEach((id) => {
      if ($(id)) $(id).innerHTML = options;
    });
    if (!state.vehicleId && state.vehicles[0]) state.vehicleId = String(state.vehicles[0].id);
    $('privateVehicleSelect').value = state.vehicleId || '';
    $('vehicleBookingVehicle').value = state.vehicleId || '';
    const teacherOptions = state.teachers.map((teacher) => `<option value="${teacher.id}">${escapeHtml(teacher.full_name)}</option>`).join('');
    $('vehicleBookingResponsible').innerHTML = teacherOptions;
    $('vehicleResponsibleField').hidden = !isAdmin();
  }

  function currentMaintenance(vehicleId) {
    const now = new Date();
    return state.maintenance.find((item) => String(item.vehicle_id) === String(vehicleId) && item.active
      && new Date(item.starts_at) <= now && (!item.ends_at || new Date(item.ends_at) > now));
  }

  function renderVehicleCards() {
    $('privateVehicleCards').innerHTML = state.vehicles.map((vehicle) => {
      const maintenance = currentMaintenance(vehicle.id);
      return `<article class="vehicle-card">
        <img src="${escapeHtml(vehicleImage(vehicle.image_path))}" alt="${escapeHtml(vehicle.display_name)}" />
        <div class="vehicle-card-body">
          <div><h3>${escapeHtml(vehicle.plate)}</h3><p>${escapeHtml(vehicle.display_name)}</p></div>
          <span class="status-chip${maintenance ? ' is-maintenance' : ''}">${maintenance ? `En mantenimiento · ${escapeHtml(categories[maintenance.category])}` : 'Disponible'}</span>
        </div>
      </article>`;
    }).join('');
  }

  function eventsForDay(day) {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const reservations = state.reservations.filter((item) => String(item.vehicle_id) === String(state.vehicleId)
      && item.status !== 'cancelled' && new Date(item.starts_at) < end && new Date(item.ends_at) > start)
      .map((item) => ({ ...item, event_type: 'reservation' }));
    const maintenance = state.maintenance.filter((item) => String(item.vehicle_id) === String(state.vehicleId) && item.active
      && new Date(item.starts_at) < end && (!item.ends_at || new Date(item.ends_at) > start))
      .map((item) => ({ ...item, event_type: 'maintenance', ends_at: item.ends_at || end.toISOString() }));
    return [...maintenance, ...reservations];
  }

  function canReserveDay(day, events) {
    const end = new Date(day); end.setHours(23, 59, 59, 999);
    return reservationsOpen() && end >= new Date() && !events.some((event) => event.event_type === 'maintenance');
  }

  function renderCalendar() {
    const { from } = monthBounds();
    $('privateVehicleMonthLabel').textContent = new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric' }).format(from);
    const first = new Date(from); first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const today = localDate(new Date());
    let html = weekdays.map((day) => `<div class="vehicle-weekday">${day}</div>`).join('');
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(first); day.setDate(first.getDate() + index);
      const events = eventsForDay(day);
      const outside = day.getMonth() !== state.month.getMonth();
      const items = events.map((event) => {
        if (event.event_type === 'maintenance') return `<span class="vehicle-event is-maintenance">${escapeHtml(categories[event.category] || 'Mantenimiento')}</span>`;
        const suspended = event.status === 'suspended_maintenance';
        return `<span class="vehicle-event${suspended ? ' is-suspended' : ''}" title="${escapeHtml(event.destination || '')}">
          ${suspended ? 'Suspendida temporalmente' : `${formatTime(event.starts_at)}–${formatTime(event.ends_at)}`}<br>${escapeHtml(event.responsible_name)}
        </span>`;
      }).join('');
      const reserve = canReserveDay(day, events) && !outside
        ? `<button class="vehicle-free-button" type="button" data-reserve-date="${localDate(day)}">Reservar</button>`
        : (!items ? '<span class="vehicle-day-empty">Disponible</span>' : '');
      html += `<div class="vehicle-day${outside ? ' is-outside' : ''}${localDate(day) === today ? ' is-today' : ''}">
        <span class="vehicle-day-number">${day.getDate()}</span>${items}${reserve}
      </div>`;
    }
    $('privateVehicleCalendar').innerHTML = html;
    $('privateVehicleCalendar').querySelectorAll('[data-reserve-date]').forEach((button) => {
      button.addEventListener('click', () => openBooking(button.dataset.reserveDate));
    });
  }

  function openBooking(date, item = null) {
    if (!reservationsOpen()) {
      window.alert('Las reservas están cerradas por la administración.');
      return;
    }
    const start = item ? new Date(item.starts_at) : new Date(`${date}T08:00:00`);
    const end = item ? new Date(item.ends_at) : new Date(`${date}T17:00:00`);
    $('vehicleBookingForm').dataset.editId = item?.id || '';
    $('vehicleBookingVehicle').value = item?.vehicle_id || state.vehicleId;
    $('vehicleBookingStart').value = localDateTime(start);
    $('vehicleBookingEnd').value = localDateTime(end);
    $('vehicleBookingDestination').value = item?.destination || '';
    $('vehicleBookingObjective').value = item?.objective || '';
    $('vehicleDriverOne').value = item?.additional_drivers?.[0] || '';
    $('vehicleDriverTwo').value = item?.additional_drivers?.[1] || '';
    if (item && isAdmin()) $('vehicleBookingResponsible').value = item.user_id;
    setMessage($('vehicleBookingMessage'), '');
    $('vehicleBookingDialog').showModal();
  }

  function renderReservationList(target, items, adminControls = false) {
    if (!items.length) {
      target.innerHTML = '<p class="empty-state">No hay reservas para mostrar.</p>';
      return;
    }
    target.innerHTML = items.map((item) => {
      const vehicle = state.vehicles.find((entry) => String(entry.id) === String(item.vehicle_id));
      const suspended = item.status === 'suspended_maintenance';
      let controls = '';
      if (adminControls) {
        controls = `<div class="vehicle-admin-actions">
          ${suspended ? `<button class="secondary-button compact-button" type="button" data-vehicle-action="reactivate" data-id="${item.id}">Reactivar</button>` : `<button class="secondary-button compact-button" type="button" data-edit-vehicle="${item.id}">Editar</button>`}
          <button class="secondary-button compact-button" type="button" data-vehicle-action="reassign" data-id="${item.id}">Reasignar</button>
          <button class="danger-button" type="button" data-vehicle-action="cancel" data-id="${item.id}">Cancelar</button>
        </div>`;
        /* controls intentionally differ by status */
      } else if (!adminControls && item.status !== 'cancelled') {
        controls = `<button class="danger-button" type="button" data-cancel-vehicle="${item.id}">Cancelar</button>`;
      }
      return `<article class="vehicle-reservation-item${suspended ? ' is-suspended' : ''}">
        <span class="vehicle-plate">${escapeHtml(vehicle?.plate || 'Vehículo')}</span>
        <div><h4>${escapeHtml(item.destination)}</h4><p>${formatDateTime(item.starts_at)} → ${formatDateTime(item.ends_at)}</p>
        <p>${escapeHtml(item.responsible_name)} · ${escapeHtml(item.objective)}${suspended ? ' · Suspendida temporalmente por mantenimiento' : ''}</p></div>
        ${controls}
      </article>`;
    }).join('');
    target.querySelectorAll('[data-cancel-vehicle]').forEach((button) => button.addEventListener('click', () => cancelReservation(button.dataset.cancelVehicle)));
    target.querySelectorAll('[data-vehicle-action]').forEach((button) => button.addEventListener('click', () => resolveReservation(button.dataset.id, button.dataset.vehicleAction)));
    target.querySelectorAll('[data-edit-vehicle]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = state.reservations.find((entry) => entry.id === button.dataset.editVehicle);
        if (item) openBooking(localDate(new Date(item.starts_at)), item);
      });
    });
  }

  function renderLists() {
    const upcoming = state.reservations.filter((item) => item.user_id === state.session?.user?.id && item.status !== 'cancelled' && new Date(item.ends_at) >= new Date());
    renderReservationList($('myVehicleReservations'), upcoming);
    if (isAdmin()) {
      renderReservationList($('suspendedVehicleReservations'), state.reservations.filter((item) => item.status === 'suspended_maintenance'), true);
      renderReservationList($('adminVehicleReservations'), state.reservations.filter((item) => item.status === 'confirmed'), true);
    }
  }

  function serviceState(service) {
    const days = service?.next_oil_date ? Math.ceil((new Date(`${service.next_oil_date}T23:59:59`) - new Date()) / 86400000) : Infinity;
    const km = service?.next_oil_mileage != null && service?.current_mileage != null ? service.next_oil_mileage - service.current_mileage : Infinity;
    if (!service?.next_oil_date && service?.next_oil_mileage == null) return { label: 'Cambio de aceite sin programar', className: 'is-warning' };
    if (days < 0 || km <= 0) return { label: 'Cambio de aceite vencido', className: 'is-overdue' };
    if (days <= 30 || km <= 500) return { label: 'Cambio de aceite próximo', className: 'is-warning' };
    return { label: 'Cambio de aceite al día', className: '' };
  }

  function dekraState(service) {
    if (!service?.next_dekra_month) return { label: 'DEKRA sin programar', className: 'is-warning' };
    const due = new Date(`${service.next_dekra_month}T23:59:59`);
    due.setMonth(due.getMonth() + 1); due.setDate(0);
    const days = Math.ceil((due - new Date()) / 86400000);
    if (days < 0) return { label: 'DEKRA vencida', className: 'is-overdue' };
    if (days <= 30) return { label: `DEKRA vence en ${days} días`, className: 'is-overdue' };
    if (days <= 60) return { label: `DEKRA vence en ${days} días`, className: 'is-warning' };
    return { label: `DEKRA: ${new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric' }).format(new Date(`${service.next_dekra_month}T12:00:00`))}`, className: '' };
  }

  function renderAdminService() {
    if (!isAdmin()) return;
    $('adminServiceAlerts').innerHTML = state.vehicles.map((vehicle) => {
      const service = state.services.find((item) => String(item.vehicle_id) === String(vehicle.id));
      const oil = serviceState(service); const dekra = dekraState(service);
      return `<article class="service-card"><h3>${escapeHtml(vehicle.plate)}</h3>
        <div class="service-alert ${oil.className}">${oil.label}</div>
        <div class="service-alert ${dekra.className}">${dekra.label}</div>
      </article>`;
    }).join('');
    loadServiceForm();
  }

  function renderMaintenanceList() {
    if (!isAdmin()) return;
    const active = state.maintenance.filter((item) => item.active);
    $('activeMaintenanceList').innerHTML = active.length ? active.map((item) => {
      const vehicle = state.vehicles.find((entry) => String(entry.id) === String(item.vehicle_id));
      return `<article class="vehicle-reservation-item"><span class="vehicle-plate">${escapeHtml(vehicle?.plate || '')}</span>
        <div><h4>${escapeHtml(categories[item.category])}</h4><p>${formatDateTime(item.starts_at)}${item.ends_at ? ` → ${formatDateTime(item.ends_at)}` : ' · Sin fecha de finalización'}</p></div>
        <button class="secondary-button compact-button" type="button" data-close-maintenance="${item.id}">Finalizar</button></article>`;
    }).join('') : '<p class="empty-state">No hay mantenimientos activos.</p>';
    $('activeMaintenanceList').querySelectorAll('[data-close-maintenance]').forEach((button) =>
      button.addEventListener('click', () => closeMaintenance(button.dataset.closeMaintenance)));
  }

  function loadServiceForm() {
    const service = state.services.find((item) => String(item.vehicle_id) === String($('serviceVehicle').value));
    $('currentMileage').value = service?.current_mileage ?? '';
    $('nextOilMileage').value = service?.next_oil_mileage ?? '';
    $('nextOilDate').value = service?.next_oil_date ?? '';
    $('nextDekraMonth').value = service?.next_dekra_month?.slice(0, 7) ?? '2026-09';
    $('serviceNotes').value = service?.notes ?? '';
  }

  async function loadCore() {
    const [{ data: vehicleData, error: vehicleError }, { data: cycleData }] = await Promise.all([
      state.client.from('vehicles').select('*').eq('active', true).order('sort_order'),
      state.client.from('reservation_cycles').select('*').eq('is_current', true).maybeSingle()
    ]);
    if (vehicleError) throw vehicleError;
    state.vehicles = vehicleData || []; state.cycle = cycleData || null;
    if (isAdmin()) {
      const { data } = await state.client.from('profiles').select('id,full_name').eq('role', 'teacher').eq('active', true).order('full_name');
      state.teachers = data || [];
    }
    renderVehicleOptions();
  }

  async function reloadData() {
    const { from, to } = monthBounds();
    const endExclusive = new Date(to); endExclusive.setDate(endExclusive.getDate() + 1);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cycleEnd = state.cycle?.reservation_end_date
      ? new Date(`${state.cycle.reservation_end_date}T23:59:59`) : new Date(today.getFullYear() + 1, 11, 31);
    const queryFrom = new Date(Math.min(from.getTime(), today.getTime()));
    const queryTo = new Date(Math.max(endExclusive.getTime(), cycleEnd.getTime()));
    const queries = [
      state.client.from('vehicle_reservations').select('*').lt('starts_at', queryTo.toISOString()).gt('ends_at', queryFrom.toISOString()).order('starts_at'),
      state.client.from('vehicle_maintenance').select('*').eq('active', true).lt('starts_at', queryTo.toISOString()).or(`ends_at.is.null,ends_at.gt.${queryFrom.toISOString()}`).order('starts_at')
    ];
    if (isAdmin()) queries.push(state.client.from('vehicle_service_schedules').select('*').order('vehicle_id'));
    const results = await Promise.all(queries);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) throw firstError;
    state.reservations = results[0].data || [];
    state.maintenance = results[1].data || [];
    state.services = results[2]?.data || [];
    renderVehicleCards(); renderCalendar(); renderLists(); renderMaintenanceList(); renderAdminService();
  }

  async function loadVehicleModule() {
    try {
      $('vehicleConnectionStatus').textContent = 'Conectando…';
      if (!state.client) state.client = window.RESERVAS_SUPABASE_CLIENT || window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
      window.RESERVAS_SUPABASE_CLIENT = state.client;
      const { data: { session } } = await state.client.auth.getSession();
      if (!session) { window.location.replace('ingreso.html?v=7'); return; }
      state.session = session;
      const { data: profile, error } = await state.client.from('profiles').select('id,full_name,email,role,admin_scope,active').eq('id', session.user.id).single();
      if (error) throw error;
      state.profile = profile;
      $('vehicleAdminPanel').hidden = !isAdmin();
      await loadCore();
      await reloadData();
      state.loaded = true;
      $('vehicleConnectionStatus').textContent = reservationsOpen() ? 'Reservas abiertas' : 'Reservas cerradas';
      $('vehicleConnectionStatus').classList.toggle('is-offline', !reservationsOpen());
    } catch (error) {
      $('vehicleConnectionStatus').textContent = 'No disponible';
      $('privateVehicleCalendar').innerHTML = `<p class="vehicle-message">${escapeHtml(error.message || 'No fue posible cargar los vehículos.')}</p>`;
    }
  }

  async function saveReservation(event) {
    event.preventDefault();
    const drivers = [$('vehicleDriverOne').value.trim(), $('vehicleDriverTwo').value.trim()].filter(Boolean);
    const userId = isAdmin() ? $('vehicleBookingResponsible').value : state.session.user.id;
    if (!userId) { setMessage($('vehicleBookingMessage'), 'Selecciona el profesor responsable.'); return; }
    const payload = {
      vehicle_id: Number($('vehicleBookingVehicle').value), user_id: userId,
      responsible_name: state.profile.full_name,
      starts_at: new Date($('vehicleBookingStart').value).toISOString(),
      ends_at: new Date($('vehicleBookingEnd').value).toISOString(),
      destination: $('vehicleBookingDestination').value.trim(),
      objective: $('vehicleBookingObjective').value.trim(),
      additional_drivers: drivers
    };
    if (new Date(payload.starts_at) >= new Date(payload.ends_at)) {
      setMessage($('vehicleBookingMessage'), 'La fecha de regreso debe ser posterior a la salida.'); return;
    }
    const editId = $('vehicleBookingForm').dataset.editId;
    const request = editId
      ? state.client.from('vehicle_reservations').update(payload).eq('id', editId)
      : state.client.from('vehicle_reservations').insert(payload);
    const { error } = await request;
    if (error) { setMessage($('vehicleBookingMessage'), error.message); return; }
    $('vehicleBookingDialog').close();
    await reloadData();
  }

  async function cancelReservation(id) {
    if (!window.confirm('¿Deseas cancelar esta reserva de vehículo?')) return;
    const { error } = await state.client.from('vehicle_reservations').update({ status: 'cancelled' }).eq('id', id);
    if (error) window.alert(error.message); else await reloadData();
  }

  async function resolveReservation(id, action) {
    const labels = { reactivate: 'reactivar', reassign: 'reasignar al otro vehículo', cancel: 'cancelar' };
    if (!window.confirm(`¿Deseas ${labels[action]} esta reserva?`)) return;
    const item = state.reservations.find((entry) => entry.id === id);
    const other = action === 'reassign' ? state.vehicles.find((vehicle) => String(vehicle.id) !== String(item.vehicle_id)) : null;
    const { error } = await state.client.rpc('admin_resolve_vehicle_reservation', {
      p_id: id, p_action: action, p_vehicle_id: other?.id || null
    });
    if (error) window.alert(error.message); else await reloadData();
  }

  async function saveMaintenance(event) {
    event.preventDefault();
    setMessage($('maintenanceMessage'), '');
    const end = $('maintenanceEnd').value ? new Date($('maintenanceEnd').value).toISOString() : null;
    const { error } = await state.client.rpc('admin_set_vehicle_maintenance', {
      p_vehicle_id: Number($('maintenanceVehicle').value),
      p_starts_at: new Date($('maintenanceStart').value).toISOString(),
      p_ends_at: end, p_category: $('maintenanceCategory').value,
      p_details: $('maintenanceDetails').value.trim()
    });
    if (error) { setMessage($('maintenanceMessage'), error.message); return; }
    setMessage($('maintenanceMessage'), 'Mantenimiento registrado. Las reservas afectadas quedaron suspendidas temporalmente.', true);
    await reloadData();
  }

  async function closeMaintenance(id) {
    if (!window.confirm('¿Deseas finalizar este mantenimiento? Las reservas suspendidas deberán revisarse manualmente.')) return;
    const { error } = await state.client.rpc('admin_close_vehicle_maintenance', { p_id: id, p_ends_at: new Date().toISOString() });
    if (error) window.alert(error.message); else await reloadData();
  }

  async function saveService(event) {
    event.preventDefault();
    const month = $('nextDekraMonth').value ? `${$('nextDekraMonth').value}-01` : null;
    const { error } = await state.client.rpc('admin_upsert_vehicle_service', {
      p_vehicle_id: Number($('serviceVehicle').value),
      p_current_mileage: $('currentMileage').value ? Number($('currentMileage').value) : null,
      p_next_oil_date: $('nextOilDate').value || null,
      p_next_oil_mileage: $('nextOilMileage').value ? Number($('nextOilMileage').value) : null,
      p_next_dekra_month: month,
      p_notes: $('serviceNotes').value.trim()
    });
    if (error) { setMessage($('serviceMessage'), error.message); return; }
    setMessage($('serviceMessage'), 'Programación actualizada.', true);
    await reloadData();
  }

  $('showPrivateClassrooms')?.addEventListener('click', () => setModule('classrooms'));
  $('showPrivateVehicles')?.addEventListener('click', () => setModule('vehicles'));
  $('privateVehicleSelect')?.addEventListener('change', (event) => { state.vehicleId = event.target.value; renderCalendar(); });
  $('privateVehiclePrevMonth')?.addEventListener('click', async () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); await reloadData(); });
  $('privateVehicleNextMonth')?.addEventListener('click', async () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); await reloadData(); });
  $('refreshVehicleReservations')?.addEventListener('click', reloadData);
  $('vehicleBookingForm')?.addEventListener('submit', saveReservation);
  $('closeVehicleBookingDialog')?.addEventListener('click', () => $('vehicleBookingDialog').close());
  $('cancelVehicleBooking')?.addEventListener('click', () => $('vehicleBookingDialog').close());
  $('maintenanceForm')?.addEventListener('submit', saveMaintenance);
  $('serviceScheduleForm')?.addEventListener('submit', saveService);
  $('serviceVehicle')?.addEventListener('change', loadServiceForm);
})();
