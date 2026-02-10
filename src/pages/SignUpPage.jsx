/**
 * SignUp Page
 * Prima volta: crea password master
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cryptoService } from '../services/cryptoService';
import { Eye, EyeOff, Lock } from 'lucide-react';

export function SignUpPage() {
  const { setupMasterPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const strength = cryptoService.checkPasswordStrength(password);

  const strengthConfig = {
    Blank: { progress: 0, color: 'bg-gray-300', text: '' },
    VeryWeak: { progress: 25, color: 'bg-red-500', text: 'Very Weak!' },
    Weak: { progress: 25, color: 'bg-orange-500', text: 'Weak!' },
    Medium: { progress: 50, color: 'bg-orange-400', text: 'Medium!' },
    Strong: { progress: 75, color: 'bg-blue-500', text: 'Strong!' },
    VeryStrong: { progress: 100, color: 'bg-green-500', text: 'Very Strong!' }
  };

  const currentStrength = strengthConfig[strength] || strengthConfig.Blank;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validazione
    if (!password || !confirmPassword) {
      setError('Required field');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 5) {
      setError('Password too short (min 5 characters)');
      return;
    }

    setIsLoading(true);

    try {
      const result = await setupMasterPassword(password);
      
      if (!result.success) {
        setError(result.error || 'Setup failed');
      }
      // Se successo, AuthContext reindirizza automaticamente
    } catch (err) {
      setError('Unexpected error');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-primary text-white py-6 px-4 text-center">
        <div className="flex items-center justify-center mb-4">
          <Lock className="w-16 h-16" />
        </div>
        <h1 className="text-3xl font-bold">SafeProfiles</h1>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Let's begin!</h2>
            <p className="mt-2 text-gray-600">
              Choose a password that you will remember. In case of loss it will not be possible to recover the data!
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Password Strength */}
            {password && (
              <div className="space-y-2">
                <label className="text-sm text-gray-600">Password strength</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${currentStrength.color}`}
                      style={{ width: `${currentStrength.progress}%` }}
                    />
                  </div>
                </div>
                <p className={`text-sm font-medium ${
                  currentStrength.progress < 50 ? 'text-red-500' : 
                  currentStrength.progress < 75 ? 'text-orange-500' : 
                  'text-green-500'
                }`}>
                  {currentStrength.text}
                </p>
              </div>
            )}

            {/* Password Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Enter password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Confirm password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Confirm password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary-dark text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Start'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
