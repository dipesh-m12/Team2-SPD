import { useState, useEffect } from 'react'

interface Drive {
  name: string;
  path: string;
  device?: string;
  type: 'drive' | 'mount';
  total: number;
  free: number;
  used: number;
  totalGB: string;
  freeGB: string;
  usedGB: string;
  usagePercent: string;
}

function App() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDrives = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('Checking for electronAPI...', !!window.electronAPI);
        console.log('Available window properties:', Object.keys(window));
        
        // Check if we're in Electron environment
        if (window.electronAPI) {
          console.log('ElectronAPI found, fetching drives...');
          const driveData = await window.electronAPI.getDrives();
          console.log('Drive data received:', driveData);
          setDrives(driveData);
        } else {
          console.error('ElectronAPI not found on window object');
          setError('ElectronAPI not available. Please ensure you\'re running this app through Electron with: npm run dev');
        }
      } catch (err) {
        console.error('Error fetching drives:', err);
        setError(`Failed to fetch drives: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    // Add a small delay to ensure preload script has time to run
    const timer = setTimeout(fetchDrives, 500);
    return () => clearTimeout(timer);
  }, []);

  const refreshDrives = () => {
    const fetchDrives = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (window.electronAPI) {
          const driveData = await window.electronAPI.getDrives();
          setDrives(driveData);
        } else {
          setError('This app requires Electron to access system drives');
        }
      } catch (err) {
        setError(`Failed to refresh drives: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    fetchDrives();
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans p-4">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 py-4 border-b border-gray-300 gap-4 md:gap-0">
        <h1 className="text-3xl font-semibold text-gray-800">System Drives</h1>
        <div className="flex gap-4 items-center">
          <button 
            onClick={refreshDrives} 
            disabled={loading} 
            className="px-4 py-2 text-gray-800 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded border border-red-200 mb-8">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="w-8 h-8 border-3 border-gray-200 border-t-gray-600 rounded-full animate-spin"></div>
          <p>Detecting drives...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 py-4">
          {drives.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-600">
              <p>No drives detected</p>
            </div>
          ) : (
            drives.map((drive, index) => (
              <div key={index} className="bg-white border border-gray-300 rounded p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">{drive.name}</h3>
                    <p className="text-sm text-gray-600 font-mono mb-1">{drive.path}</p>
                    {drive.device && <p className="text-xs text-gray-500 font-mono">{drive.device}</p>}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="flex flex-col items-center p-3 bg-gray-50 rounded border border-gray-200">
                    <span className="text-xs text-gray-600 mb-1 uppercase">Total:</span>
                    <span className="text-base font-semibold text-gray-800">{drive.totalGB} GB</span>
                  </div>
                  <div className="flex flex-col items-center p-3 bg-gray-50 rounded border border-gray-200">
                    <span className="text-xs text-gray-600 mb-1 uppercase">Used:</span>
                    <span className="text-base font-semibold text-gray-800">{drive.usedGB} GB</span>
                  </div>
                  <div className="flex flex-col items-center p-3 bg-gray-50 rounded border border-gray-200">
                    <span className="text-xs text-gray-600 mb-1 uppercase">Free:</span>
                    <span className="text-base font-semibold text-gray-800">{drive.freeGB} GB</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gray-600 rounded-full" 
                      style={{ width: `${drive.usagePercent}%` }}
                    ></div>
                  </div>
                  <span className="text-sm text-gray-600 min-w-20 text-right">{drive.usagePercent}% used</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default App
