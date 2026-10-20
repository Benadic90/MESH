import { useState } from 'react';
import axios from 'axios';
import dynamic from 'next/dynamic';
import { useAppStore } from '../store/appStore';

const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
  loading: () => <p className="map-loading">Loading map preview…</p>
});

const API_URL = 'http://localhost:4000';

const emergencyTypes = [
  { id: 'medical', icon: '✚', title: 'Medical help', detail: 'Injury or illness', message: 'I need medical help.', resources: ['ambulance', 'medical_team'] },
  { id: 'danger', icon: '⚠', title: 'Danger', detail: 'Unsafe situation', message: 'I am in an unsafe situation and need help.', resources: ['fire_team'] },
  { id: 'supplies', icon: '💧', title: 'Food & water', detail: 'Essential supplies', message: 'I need food or clean drinking water.', resources: ['food_supply'] },
  { id: 'shelter', icon: '⌂', title: 'Safe shelter', detail: 'A safe place to stay', message: 'I need a safe shelter.', resources: ['shelter_unit'] }
];

const resourcesList = [
  { id: 'ambulance', label: 'Ambulance' },
  { id: 'medical_team', label: 'Medical team' },
  { id: 'fire_team', label: 'Fire team' },
  { id: 'shelter_unit', label: 'Shelter' },
  { id: 'food_supply', label: 'Food & water' }
];

const emptyForm = {
  reporterName: '',
  contactNumber: '',
  area: '',
  lat: '',
  lng: '',
  message: '',
  peopleCount: 1,
  neededResources: []
};

export default function SosForm() {
  const [formData, setFormData] = useState(emptyForm);
  const [isLocating, setIsLocating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { isOffline, cacheOfflineRequest } = useAppStore();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const chooseEmergency = (type) => {
    setFormData((previous) => ({
      ...previous,
      message: type.message,
      neededResources: Array.from(new Set([...previous.neededResources, ...type.resources]))
    }));
    setResult(null);
    setError(null);
  };

  const handleCheckboxChange = (id) => {
    setFormData((previous) => ({
      ...previous,
      neededResources: previous.neededResources.includes(id)
        ? previous.neededResources.filter((resource) => resource !== id)
        : [...previous.neededResources, id]
    }));
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setError('This browser cannot access GPS. Please type a nearby landmark or area.');
      return;
    }

    setIsLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        let areaName = '';

        try {
          const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: { format: 'json', lat, lon: lng, zoom: 18, addressdetails: 1 }
          });
          const address = response.data?.address;
          if (address) {
            areaName = [
              address.road || address.suburb,
              address.city || address.town || address.village,
              address.state
            ].filter(Boolean).join(', ');
          }
        } catch (geocodingError) {
          // Coordinates are still useful if reverse geocoding is unavailable.
        }

        setFormData((previous) => ({
          ...previous,
          lat,
          lng,
          area: areaName || previous.area
        }));
        setIsLocating(false);
      },
      () => {
        setError('We could not get your location. You can enter your area or a nearby landmark instead.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    const payload = {
      reporterName: formData.reporterName || undefined,
      contactNumber: formData.contactNumber || undefined,
      location: {
        area: formData.area.trim(),
        lat: formData.lat ? Number.parseFloat(formData.lat) : undefined,
        lng: formData.lng ? Number.parseFloat(formData.lng) : undefined
      },
      message: formData.message.trim(),
      peopleCount: formData.peopleCount ? Number.parseInt(formData.peopleCount, 10) : 1,
      neededResources: formData.neededResources.length ? formData.neededResources : undefined
    };

    if (isOffline) {
      cacheOfflineRequest(payload);
      setResult({ id: 'local_' + Math.random().toString(36).slice(2, 11), status: 'pending', priorityScore: 50, severityLabel: 'CACHED OFFLINE' });
      setFormData(emptyForm);
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/send_sos`, payload, { timeout: 10000 });
      setResult(response.data.data);
      setFormData(emptyForm);
    } catch (submitError) {
      setError(submitError.response?.data?.error || 'We could not send the request right now. Check your connection or switch to offline mode to save it on this device.');
    }
  };

  return (
    <div className="sos-page">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">EMERGENCY SUPPORT</p>
          <h1>What help do you need?</h1>
          <p className="welcome-copy">Choose an option below. You can ask for help without filling in every detail.</p>
        </div>
        <div className={`connection-pill ${isOffline ? 'connection-offline' : 'connection-ready'}`} role="status">
          <span className="connection-dot" />
          {isOffline ? 'Offline save mode' : 'Ready to create a request'}
        </div>
      </section>

      {result && (
        <section className="feedback-card feedback-success" role="status" aria-live="polite">
          <div className="feedback-icon" aria-hidden="true">✓</div>
          <div className="feedback-content">
            <h2>{result.severityLabel === 'CACHED OFFLINE' ? 'Request saved on this device' : 'Request accepted by the server'}</h2>
            <p>{result.severityLabel === 'CACHED OFFLINE'
              ? 'It has not been sent yet. Reconnect to the local network and sync when available.'
              : 'Your request was accepted. This does not by itself confirm that a responder has been assigned.'}</p>
            <div className="request-id-row">
              <span>Request ID: <code>{result.id}</code></span>
              <button type="button" className="button-secondary button-small" onClick={() => navigator.clipboard?.writeText(String(result.id))}>Copy ID</button>
            </div>
          </div>
        </section>
      )}

      {error && (
        <section className="feedback-card feedback-error" role="alert">
          <div className="feedback-icon" aria-hidden="true">!</div>
          <div className="feedback-content">
            <h2>We need one more step</h2>
            <p>{error}</p>
          </div>
          <button type="button" className="dismiss-button" aria-label="Dismiss message" onClick={() => setError(null)}>×</button>
        </section>
      )}

      <section className="emergency-grid" aria-label="Choose emergency type">
        {emergencyTypes.map((type) => (
          <button type="button" key={type.id} className="emergency-choice" onClick={() => chooseEmergency(type)}>
            <span className={`emergency-icon emergency-icon-${type.id}`} aria-hidden="true">{type.icon}</span>
            <span className="emergency-choice-title">{type.title}</span>
            <span className="emergency-choice-detail">{type.detail}</span>
          </button>
        ))}
      </section>

      <form className="request-form card-modern" onSubmit={handleSubmit}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR REQUEST</p>
            <h2>Tell us where to help</h2>
          </div>
          <span className="step-label">A few details</span>
        </div>

        <div className="form-field">
          <label htmlFor="message">What is happening? <span className="required-mark">*</span></label>
          <textarea id="message" name="message" value={formData.message} onChange={handleChange} required rows={3} maxLength={1000} placeholder="Example: Someone is injured near the school gate." />
          <p className="field-hint">You can use simple words. A short description is enough.</p>
        </div>

        <div className="form-field">
          <label htmlFor="area">Your area or nearby landmark <span className="required-mark">*</span></label>
          <input id="area" name="area" value={formData.area} onChange={handleChange} required maxLength={240} placeholder="Village, road, school, building…" />
          <div className="location-actions">
            <button type="button" className="button-secondary" onClick={handleGetLocation} disabled={isLocating}>
              <span aria-hidden="true">⌖</span> {isLocating ? 'Finding your location…' : 'Use my current location'}
            </button>
            {formData.lat && formData.lng && <span className="location-confirmation" role="status">✓ GPS location added</span>}
          </div>
          {formData.lat && formData.lng && (
            <div className="map-preview">
              <MapComponent height="180px" requests={[{ id: 'preview', status: 'pending', severityLabel: 'high', location: { lat: Number.parseFloat(formData.lat), lng: Number.parseFloat(formData.lng) }, message: 'Your location' }]} />
            </div>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="peopleCount">How many people need help?</label>
          <input id="peopleCount" className="people-input" type="number" min="1" max="999" name="peopleCount" value={formData.peopleCount} onChange={handleChange} />
        </div>

        <fieldset className="resource-fieldset">
          <legend>What help is needed? <span className="optional-mark">Optional</span></legend>
          <div className="resource-options">
            {resourcesList.map((resource) => {
              const selected = formData.neededResources.includes(resource.id);
              return (
                <label key={resource.id} className={`resource-option ${selected ? 'resource-option-selected' : ''}`}>
                  <input type="checkbox" checked={selected} onChange={() => handleCheckboxChange(resource.id)} />
                  <span className="resource-check" aria-hidden="true">{selected ? '✓' : '+'}</span>
                  <span>{resource.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <details className="optional-details">
          <summary>Add contact details (optional)</summary>
          <div className="optional-grid">
            <div className="form-field">
              <label htmlFor="reporterName">Your name</label>
              <input id="reporterName" name="reporterName" value={formData.reporterName} onChange={handleChange} autoComplete="name" placeholder="Name" />
            </div>
            <div className="form-field">
              <label htmlFor="contactNumber">Phone number</label>
              <input id="contactNumber" name="contactNumber" value={formData.contactNumber} onChange={handleChange} inputMode="tel" autoComplete="tel" placeholder="Number helpers can call" />
            </div>
          </div>
        </details>

        <button type="submit" className="submit-sos-button">
          <span className="submit-sos-symbol" aria-hidden="true">!</span>
          <span><strong>Send help request</strong><small>{isOffline ? 'Save it on this device for later syncing' : 'Send to the RESCUE-MESH server'}</small></span>
          <span className="submit-arrow" aria-hidden="true">→</span>
        </button>
        <p className="privacy-note">Only include details that are useful for helping you. If someone is in immediate danger, contact local emergency services when possible.</p>
      </form>
    </div>
  );
}
