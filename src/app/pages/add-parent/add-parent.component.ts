import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Database, ref, set, push, get } from '@angular/fire/database';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface ParentData {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
  password?: string;
  address: {
    street: string;
    city: string;
    postalCode: string;
  };
  schoolName: string;
  studentCount: number;
  studentList: string[];
  title: 'Mr.' | 'Mrs.';
  nationalId: string;
  role: string;
  academicRole: 'Father' | 'Mother' | 'Guardian';
  dataCompleted: boolean;
  frozen: boolean;
  createdAt: number;
}

@Component({
  selector: 'app-add-parent',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './add-parent.component.html',
  styleUrls: ['./add-parent.component.css']
})
export class AddParentComponent implements OnInit {
  parentForm!: FormGroup;
  loading = false;
  error = '';
  success = '';
  foundStudents: any[] = [];
  selectedStudents: string[] = [];
  searchQuery = '';



  constructor(
    private fb: FormBuilder,
    private db: Database,
    private router: Router,
    private auth: AuthService
  ) {

  }

  ngOnInit(): void {
    this.initForm();
    this.loadStudents();
  }

  initForm(): void {
    this.parentForm = this.fb.group({
      civility: ['Monsieur', Validators.required],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      telephone: ['', [Validators.required, Validators.pattern('^[0-9]{8,}$')]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      address: this.fb.group({
        street: ['', Validators.required],
        city: ['', Validators.required],
        postalCode: ['', [Validators.required, Validators.pattern('^[0-9]{4,5}$')]]
      }),
      childrenSchool: ['', Validators.required],
      childrenCount: [1, [Validators.required, Validators.min(1)]],
      nationalId: ['', [Validators.required, Validators.pattern('^[0-9]{8}$')]],
      academicRole: ['Father', Validators.required]
    });
  }

  async loadStudents(): Promise<void> {
    try {
      this.loading = true;
      const snapshot = await get(ref(this.db, 'users'));
      if (snapshot.exists()) {
        const users = snapshot.val();
        this.foundStudents = Object.entries(users)
          .map(([uid, data]: [string, any]) => ({
            uid,
            ...data
          }))
          .filter(user => user.role === 'Student');
        
        this.foundStudents.sort((a, b) => {
          const nameA = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase();
          const nameB = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase();
          return nameA.localeCompare(nameB);
        });
      }
    } catch (error) {
      console.error('Error loading students:', error);
      this.error = 'Failed to load students. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  filterStudents(): any[] {
    if (!this.searchQuery.trim()) return [];
    
    const query = this.searchQuery.toLowerCase().trim();
    return this.foundStudents.filter(student => {
      const firstName = student.firstName?.toLowerCase() || '';
      const lastName = student.lastName?.toLowerCase() || '';
      const fullName = `${firstName} ${lastName}`;
      
      return firstName.includes(query) || 
             lastName.includes(query) || 
             fullName.includes(query);
    });
  }

  toggleStudentSelection(uid: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked && !this.selectedStudents.includes(uid)) {
      this.selectedStudents.push(uid);
    } else {
      this.selectedStudents = this.selectedStudents.filter(id => id !== uid);
    }
  }

  removeStudent(uid: string): void {
    this.selectedStudents = this.selectedStudents.filter(id => id !== uid);
  }

  getStudentName(uid: string): string {
    const student = this.foundStudents.find(s => s.uid === uid);
    if (student) {
      return `${student.firstName || ''} ${student.lastName || ''}`;
    }
    return 'Student';
  }

  cancel(): void {
    this.router.navigate(['/dashboard'], { queryParams: { section: 'parent-list' } });
  }

  async onSubmit(): Promise<void> {
    if (this.parentForm.invalid) {
      this.touchAllFormFields(this.parentForm);
      return;
    }

    if (this.selectedStudents.length === 0) {
      this.error = 'Please select at least one student';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    try {
      const formValues = this.parentForm.value;
      const parentsRef = ref(this.db, 'users');
      const newParentRef = push(parentsRef);
      const parentId = newParentRef.key;
      
      if (!parentId) {
        throw new Error('Failed to generate parent ID');
      }
      
      const parentData: ParentData = {
        firstName: formValues.firstName,
        lastName: formValues.lastName,
        email: formValues.email,
        dataCompleted: true,
        frozen: true,
        password: formValues.password,
        telephone: formValues.telephone,
        address: {
          street: formValues.address.street,
          city: formValues.address.city,
          postalCode: formValues.address.postalCode
        },
        schoolName: formValues.childrenSchool,
        studentCount: formValues.childrenCount,
        studentList: this.selectedStudents,
        title: formValues.civility,
        nationalId: formValues.nationalId,
        role: 'Parent',
        academicRole: formValues.academicRole,
        createdAt: Date.now(),
        uid: parentId
      };

      await set(ref(this.db, `users/${parentId}`), parentData);
      
      for (const studentId of this.selectedStudents) {
        const studentRef = ref(this.db, `users/${studentId}`);
        const studentSnapshot = await get(studentRef);
        
        if (studentSnapshot.exists()) {
          const studentData = studentSnapshot.val();
          const parentsList = studentData.parentsList || [];
          if (!parentsList.includes(parentId)) {
            parentsList.push(parentId);
            await set(ref(this.db, `users/${studentId}/parentsList`), parentsList);
          }
        }
      }

      this.success = '✅ Parent added successfully. Pending activation.';
      this.parentForm.reset();
      this.selectedStudents = [];
      this.initForm();
      
      setTimeout(() => {
        this.router.navigate(['/dashboard'], { queryParams: { section: 'parent-list' } });
      }, 2000);
    } catch (error) {
      console.error('Error adding parent:', error);
      this.error = '❌ Error adding parent. Please try again.';
    } finally {
      this.loading = false;
    }
  }

  touchAllFormFields(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.touchAllFormFields(control);
      }
    });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.parentForm.get(field);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  getErrorMessage(field: string): string {
    const control = this.parentForm.get(field);
    if (!control) return '';
    
    if (control.hasError('required')) {
      return 'This field is required';
    }
    if (control.hasError('email')) {
      return 'Please enter a valid email';
    }
    if (control.hasError('minlength')) {
      return `Must be at least ${control.getError('minlength').requiredLength} characters`;
    }
    if (control.hasError('min')) {
      return `Minimum value is ${control.getError('min').min}`;
    }
    if (control.hasError('pattern')) {
      switch (field) {
        case 'telephone': return 'Must be at least 8 digits';
        case 'postalCode': return 'Must be 4-5 digits';
        case 'nationalId': return 'Must be 8 digits';
        default: return 'Invalid format';
      }
    }
    return '';
  }

}
