export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  MachinesTab: undefined;
  SettingsTab: undefined;
};

export type MachinesStackParamList = {
  Machines: undefined;
  MachineDetail: { machineId: string };
  AgentDetail: { machineId: string; agentType: string };
  ActionResult: { machineId: string; actionId: string };
};

export type SettingsStackParamList = {
  Settings: undefined;
};
