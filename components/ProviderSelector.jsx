'use client';

export function ProviderSelector({
  label,
  providers,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  modelKey = 'models',
  modelLabel = 'Model',
}) {
  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const items = currentProvider?.[modelKey] || [];

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <div className="flex gap-2">
        <select
          value={selectedProvider}
          onChange={(e) => onProviderChange(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      {items.find((m) => m.id === selectedModel)?.description && (
        <p className="text-xs text-gray-500">
          {items.find((m) => m.id === selectedModel)?.description}
        </p>
      )}
    </div>
  );
}
