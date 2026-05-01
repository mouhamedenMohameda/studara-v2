import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthStackParamList } from '../types';
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';
import PendingApprovalScreen from '../screens/Auth/PendingApprovalScreen';
import ForgotPasswordScreen from '../screens/Auth/ForgotPasswordScreen';
import { useModernStackOptions } from './modernNavigator';

const Stack = createStackNavigator<AuthStackParamList>();

const AuthNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <Stack.Navigator screenOptions={opts}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
