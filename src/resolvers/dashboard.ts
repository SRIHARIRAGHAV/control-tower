import { getDashboardData } from '../backend/handlers/source-handlers';
import { resolver } from './registry';

resolver.define('getDashboardData', getDashboardData);
