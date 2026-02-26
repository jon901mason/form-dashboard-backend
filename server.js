import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import './Dashboard.css';
import AddClient from './AddClient';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function getAxiosErrorMessage(err) {
  if (err?.response?.data) {
    try {
      return typeof err.response.data === 'string'
        ? err.response.data
        : JSON.stringify(err.response.data);
    } catch { }
  }
  return err?.message || 'Unknown error';
}

function splitName(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw) return { first: '', last: '' };
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function Dashboard({ user, token, onLogout }) {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);

  const [forms, setForms] = useState([]);
  const [selectedForm, setSelectedForm] = useState(null);

  const [submissions, setSubmissions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showAddClient, setShowAddClient] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  );

  const fetchClients = useCallback(async () => {
    setError('');
    setLoading(true);

    try {
      const response = await axios.get(`${API_URL}/api/clients`, { headers });
      const list = Array.isArray(response.data) ? response.data : [];
      setClients(list);

      if (list.length === 1) setSelectedClient(list[0]);
    } catch (err) {
      setError(`Failed to load clients: ${getAxiosErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const fetchFormsForClient = useCallback(
    async (client) => {
      if (!client?.id) return;

      setError('');
      setLoading(true);
      setSelectedForm(null);
      setSubmissions([]);

      try {
        const response = await axios.get(`${API_URL}/api/forms/client/${client.id}`, { headers });
        setForms(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        setForms([]);
        setError(`Failed to load forms: ${getAxiosErrorMessage(err)}`);
      } finally {
        setLoading(false);
      }
    },
    [headers]
  );

  const fetchSubmissionsForForm = useCallback(
    async (form) => {
      if (!form?.id) return;

      setError('');
      setLoading(true);

      try {
        const response = await axios.get(`${API_URL}/api/forms/${form.id}/submissions`, { headers });
        setSubmissions(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        setSubmissions([]);
        setError(`Failed to load submissions: ${getAxiosErrorMessage(err)}`);
      } finally {
        setLoading(false);
      }
    },
    [headers]
  );

  const deleteSubmission = useCallback(
    async (submissionId) => {
      if (!submissionId) return;

      const ok = window.confirm('Delete this submission? This cannot be undone.');
      if (!ok) return;

      setError('');
      try {
        await axios.delete(`${API_URL}/api/forms/submissions/${submissionId}`, { headers });
        setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
      } catch (err) {
        setError(`Failed to delete submission: ${getAxiosErrorMessage(err)}`);
      }
    },
    [headers]
  );

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    if (selectedClient) fetchFormsForClient(selectedClient);
  }, [selectedClient, fetchFormsForClient]);

  const handleClientSelect = (client) => setSelectedClient(client);

  const handleFormSelect = async (form) => {
    setSelectedForm(form);
    await fetchSubmissionsForForm(form);
  };

  const getFilteredSubmissions = () => {
    if (!startDate && !endDate) return submissions;

    return submissions.filter((sub) => {
      const subDate = new Date(sub.submitted_at);
      const start = startDate ? new Date(startDate) : new Date('1970-01-01');
      const end = endDate ? new Date(endDate) : new Date('2099-12-31');
      end.setHours(23, 59, 59, 999);
      return subDate >= start && subDate <= end;
    });
  };

  const filteredSubmissions = getFilteredSubmissions();

  const columns = useMemo(() => {
    if (!filteredSubmissions.length) return [];
    const keys = [];

    const seen = new Set();
    filteredSubmissions.forEach((sub) => {
      const d = sub?.submission_data || {};
      Object.keys(d).forEach((k) => {
        if (k === 'Name') return;
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      });
    });

    return ['First Name', 'Last Name', ...keys, 'Submitted', 'Actions'];
  }, [filteredSubmissions]);

  const downloadCSV = () => {
    if (!filteredSubmissions.length) {
      alert('No submissions to download');
      return;
    }

    const baseKeys = [];
    const seen = new Set();

    filteredSubmissions.forEach((sub) => {
      const d = sub?.submission_data || {};
      Object.keys(d).forEach((k) => {
        if (k === 'Name') return;
        if (!seen.has(k)) {
          seen.add(k);
          baseKeys.push(k);
        }
      });
    });

    const csvHeaders = ['First Name', 'Last Name', ...baseKeys, 'Submitted'];

    const rows = filteredSubmissions.map((sub) => {
      const data = sub?.submission_data || {};
      const { first, last } = splitName(data?.Name);

      const rowVals = [
        first,
        last,
        ...baseKeys.map((k) => data?.[k] ?? ''),
        new Date(sub.submitted_at).toLocaleString(),
      ];

      return rowVals.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [csvHeaders.join(','), ...rows].join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(csv));
    element.setAttribute('download', `${selectedForm?.form_name || 'submissions'}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleClientAdded = (newClient) => setClients((prev) => [...prev, newClient]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Form Submission Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user?.name || user?.email}</span>
          <button onClick={onLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        {error && (
          <div className="error-message" style={{ whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        )}

        <div className="clients-section">
          <h2>Clients</h2>
          <button onClick={() => setShowAddClient(true)} className="add-client-btn">
            + Add Client
          </button>

          {loading && <p>Loading...</p>}

          <div className="clients-list">
            {clients.length === 0 ? (
              <p className="empty-state">No clients yet. Add one to get started!</p>
            ) : (
              clients.map((client) => (
                <button
                  key={client.id}
                  className={`client-btn ${selectedClient?.id === client.id ? 'active' : ''}`}
                  onClick={() => handleClientSelect(client)}
                >
                  {client.name}
                </button>
              ))
            )}
          </div>
        </div>

        {selectedClient && (
          <div className="forms-section">
            <h2>Forms for {selectedClient.name}</h2>
            {loading && <p>Loading...</p>}
            <div className="forms-list">
              {forms.length === 0 ? (
                <p className="empty-state">No forms found.</p>
              ) : (
                forms.map((form) => (
                  <button
                    key={form.id}
                    className={`form-btn ${selectedForm?.id === form.id ? 'active' : ''}`}
                    onClick={() => handleFormSelect(form)}
                  >
                    {form.form_name} ({form.form_plugin})
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {selectedForm && (
          <div className="submissions-section">
            <h2>Submissions for {selectedForm.form_name}</h2>

            <div className="filter-section">
              <div className="date-range">
                <div className="date-input">
                  <label>From</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="date-input">
                  <label>To</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>

              <button onClick={() => { setStartDate(''); setEndDate(''); }} className="reset-btn">
                Clear Dates
              </button>

              <button onClick={downloadCSV} className="download-btn">
                Download as CSV
              </button>
            </div>

            <div className="submission-count">
              Showing {filteredSubmissions.length} of {submissions.length} submissions
            </div>

            {filteredSubmissions.length === 0 ? (
              <p className="empty-state">No submissions found</p>
            ) : (
              <div className="submissions-table">
                <table>
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map((sub) => {
                      const data = sub?.submission_data || {};
                      const { first, last } = splitName(data?.Name);

                      const otherCols = columns.filter(
                        (c) => c !== 'First Name' && c !== 'Last Name' && c !== 'Submitted' && c !== 'Actions'
                      );

                      return (
                        <tr key={sub.id}>
                          <td>{first}</td>
                          <td>{last}</td>

                          {otherCols.map((key) => (
                            <td key={key}>{String(data?.[key] ?? '').substring(0, 50)}</td>
                          ))}

                          <td>{new Date(sub.submitted_at).toLocaleString()}</td>

                          <td>
                            <button
                              onClick={() => deleteSubmission(sub.id)}
                              style={{ cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showAddClient && (
        <AddClient token={token} onClientAdded={handleClientAdded} onClose={() => setShowAddClient(false)} />
      )}
    </div>
  );
}

export default Dashboard;