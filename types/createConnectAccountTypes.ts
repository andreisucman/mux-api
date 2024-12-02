export type ConnectParamsType = {
  type: string;
  business_type: string;
  individual: {
    email: any;
  };
  country: any;
  capabilities: {
    transfers: {
      requested: boolean;
    };
    card_payments: {
      requested: boolean;
    };
  };
  business_profile: {
    mcc: string;
    url: string;
  };
  settings: { [key: string]: any };
  tos_acceptance?: {
    service_agreement: string;
  };
};
