import React from 'react';
import { useParams } from 'react-router-dom';
import { L11CabinetDisplay } from '@/components/cabinet/L11CabinetDisplay';

export default function SingleCabinetDisplayPage() {
  const { cabinetId } = useParams<{ cabinetId: string }>();
  
  return <L11CabinetDisplay cabinetId={cabinetId} />;
}