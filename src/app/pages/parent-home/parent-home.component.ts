import { Component, OnInit, NgZone } from '@angular/core';
import { Database, get, ref, set, update } from '@angular/fire/database';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LanguageService } from '../../services/language.service';

type Language = 'en' | 'ar';
type TranslationKey = 
  | 'searchFields' 
  | 'childNotFound' 
  | 'childAlreadyLinked' 
  | 'searchError' 
  | 'loadingError' 
  | 'userNotAuth' 
  | 'addChildError' 
  | 'updateError' 
  | 'firstName' 
  | 'lastName' 
  | 'birthday' 
  | 'grade' 
  | 'teacher' 
  | 'actions' 
  | 'edit' 
  | 'save' 
  | 'cancel' 
  | 'search' 
  | 'addChild' 
  | 'noTeacher' 
  | 'searchResults' 
  | 'childrenOverview'
  | 'welcome'
  | 'searchForChild'
  | 'childrenList'
  | 'notAssigned';

interface ChildSearch {
  lastName: string;
  firstName: string;
  birthday: string;
}

interface Student {
  uid: string;
  firstName: string;
  lastName: string;
  birthday: string;
  role: string;
  grade?: string;
  school?: string;
  linkedTeacherId?: string;
}

@Component({
  selector: 'app-parent-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parent-home.component.html',
  styleUrls: ['./parent-home.component.css']
})
export class ParentHomeComponent implements OnInit {
  private translations: Record<Language, Record<TranslationKey, string>> = {
    'en': {
      'searchFields': 'Please fill all search fields.',
      'childNotFound': 'No child found with this information.',
      'childAlreadyLinked': 'This child is already linked to you.',
      'searchError': 'Error during search.',
      'loadingError': 'Error loading parent data',
      'userNotAuth': 'User not authenticated',
      'addChildError': 'Error while adding the child to Firebase.',
      'updateError': 'Error updating child.',
      'firstName': 'First Name',
      'lastName': 'Last Name',
      'birthday': 'Birthday',
      'grade': 'Grade',
      'teacher': 'Teacher',
      'actions': 'Actions',
      'edit': 'Edit',
      'save': 'Save',
      'cancel': 'Cancel',
      'search': 'Search',
      'addChild': 'Add Child',
      'noTeacher': 'N/A',
      'searchResults': 'Search Results',
      'childrenOverview': 'Children Overview',
      'welcome': 'Welcome',
      'searchForChild': 'Search for a child',
      'childrenList': 'Children List',
      'notAssigned': 'Not Assigned'
    },
    'ar': {
      'searchFields': 'يرجى ملء جميع حقول البحث.',
      'childNotFound': 'لم يتم العثور على طفل بهذه المعلومات.',
      'childAlreadyLinked': 'هذا الطفل مرتبط بك بالفعل.',
      'searchError': 'خطأ أثناء البحث.',
      'loadingError': 'خطأ في تحميل بيانات الوالد',
      'userNotAuth': 'المستخدم غير مصادق عليه',
      'addChildError': 'خطأ أثناء إضافة الطفل إلى قاعدة البيانات.',
      'updateError': 'خطأ في تحديث بيانات الطفل.',
      'firstName': 'الاسم الأول',
      'lastName': 'اسم العائلة',
      'birthday': 'تاريخ الميلاد',
      'grade': 'الصف',
      'teacher': 'المعلم',
      'actions': 'الإجراءات',
      'edit': 'تعديل',
      'save': 'حفظ',
      'cancel': 'إلغاء',
      'search': 'بحث',
      'addChild': 'إضافة طفل',
      'noTeacher': 'غير متوفر',
      'searchResults': 'نتائج البحث',
      'childrenOverview': 'نظرة عامة على الأطفال',
      'welcome': 'مرحباً',
      'searchForChild': 'البحث عن طفل',
      'childrenList': 'قائمة الأطفال',
      'notAssigned': 'غير معين'
    }
  };

  parentName = '';
  parentCivilite: string = '';
  parentLastName: string = '';
  parentFirstName: string = '';
  loading = false;
  errorMessage = '';
  searchError = '';
  userId = '';
  children: Student[] = [];
  childSearch: ChildSearch = { lastName: '', firstName: '', birthday: '' };
  foundChild: Student | null = null;
  editChild: Student | null = null;
  teachers: { [key: string]: any } = {};

  constructor(
    private db: Database,
    private auth: AuthService,
    private ngZone: NgZone,
    private router: Router,
    public langService: LanguageService
  ) {}

  getTranslation(key: TranslationKey): string {
    const currentLang = this.langService.getCurrentLanguage() as Language;
    return this.translations[currentLang]?.[key] || key;
  }
  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const user = await firstValueFrom(this.auth.getCurrentUserWithRole());
      if (!user) { this.errorMessage = this.getTranslation('userNotAuth'); return; }
      this.userId = user.uid;
      this.parentCivilite = user.civilite || '';
      this.parentLastName = user.lastName || '';
      this.parentFirstName = user.firstName || '';
      await this.ensureParentHasUID();
      const childrenList = user.la_liste_enfants || [];
      await this.loadTeachers();
      if (Array.isArray(childrenList) && childrenList.length > 0) {
        await this.loadChildren(childrenList);
      }
    } catch (error) {
      this.errorMessage = this.getTranslation('loadingError');
    } finally {
      this.loading = false;
    }
  }

  async loadChildren(childIds: string[]) {
    this.children = [];
    if (!childIds || childIds.length === 0) return;
    const usersRef = ref(this.db, 'users');
    const snapshot = await get(usersRef);
    if (snapshot.exists()) {
      const users = snapshot.val();
      console.log('All users from DB:', users);
      
      this.children = childIds
        .map(uid => {
          const child = users[uid];
          return child;
        })
        .filter(child => !!child)
        .map(child => ({
          uid: child.uid,
          firstName: child.firstName,
          lastName: child.lastName,
          birthday: child.birthday,
          grade: child.schoolGrade || child.grade || '',
          role: child.role,
          linkedTeacherId: child.linkedTeacherId || '' 
        }));
    }
  }
  async searchChild(): Promise<void> {
    this.foundChild = null;
    this.searchError = '';
    if (!this.childSearch.lastName.trim() || !this.childSearch.firstName.trim() || !this.childSearch.birthday) {
      this.searchError = this.getTranslation('searchFields');
      return;
    }
    this.loading = true;
    try {
      const snapshot = await get(ref(this.db, 'users'));
      if (snapshot.exists()) {
        const users = snapshot.val();
        console.log('Searching for child with criteria:', this.childSearch);
        
        const found = Object.entries(users)
  .map(([uid, data]: [string, any]) => ({ uid, ...(data || {}) })) 
  .find(user => {
    const firstNameMatch = user.firstName?.toLowerCase().trim() === this.childSearch.firstName.toLowerCase().trim();
    const lastNameMatch = user.lastName?.toLowerCase().trim() === this.childSearch.lastName.toLowerCase().trim();
    const birthdayMatch = user.birthday === this.childSearch.birthday;
    const isStudent = user.role === 'Student';
    
    console.log(`Checking user ${user.uid}:`, { 
      firstNameMatch, 
      lastNameMatch, 
      birthdayMatch, 
      isStudent 
    });
    
    return firstNameMatch && lastNameMatch && birthdayMatch && isStudent;
  });
        
        if (found) {
          console.log('Found child:', found);
          
          const userRef = ref(this.db, 'users/' + this.userId);
          const userSnapshot = await get(userRef);
          let alreadyLinked = false;
          
          if (userSnapshot.exists()) {
            const userData = userSnapshot.val();
            const childrenList = userData.la_liste_enfants || [];
            alreadyLinked = Array.isArray(childrenList) && childrenList.includes(found.uid);
            console.log('Child already linked?', alreadyLinked);
          }
            if (alreadyLinked) {
            this.searchError = this.getTranslation('childAlreadyLinked');
          } else {
            this.foundChild = {
              ...found,
              school: (found as any).linkedSchoolId || '',
              grade: (found as any).schoolGrade || ''
            } as Student;
          }
        } else {
          this.searchError = this.getTranslation('childNotFound');
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      this.searchError = this.getTranslation('searchError');
    } finally {
      this.loading = false;
    }
  }
async ensureParentHasUID() {
  if (this.userId) {
    const parentRef = ref(this.db, 'users/' + this.userId);
    const parentSnapshot = await get(parentRef);
    
    if (parentSnapshot.exists()) {
      const parentData = parentSnapshot.val();
      
      if (!parentData.uid) {
        console.log('Adding uid to parent data:', this.userId);
        await update(parentRef, {
          uid: this.userId
        });
        console.log('UID added to parent data');
      }
    }
  }
}
  async addChildToParent(child: Student) {
    console.log('Adding child to parent:', child);    
    if (this.children.find(c => c.uid === child.uid)) {
      this.searchError = this.getTranslation('childAlreadyLinked');
      return;
    }
    
    this.loading = true;
    try {
      const userRef = ref(this.db, 'users/' + this.userId);
      const userSnapshot = await get(userRef);

      
      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        
        let childrenList = userData.la_liste_enfants || [];
        console.log('Current children list before update:', childrenList);
        
        if (Array.isArray(childrenList)) {
        } else if (typeof childrenList === 'object' && childrenList !== null) {
          childrenList = Object.values(childrenList);
        } else {
          childrenList = [];
        }
        console.log('Transformed children list:', childrenList);
        
        if (!Array.isArray(childrenList)) {
          childrenList = [];
        }
        
        if (!childrenList.includes(child.uid)) {
          childrenList.push(child.uid);
          console.log('New children list to save:', childrenList);
          
          await update(userRef, {
            la_liste_enfants: childrenList,
            nombre_enfants : userData.nombre_enfants + 1

          });
          
          console.log('Firebase update completed');
          
          const childToAdd = {
            uid: child.uid,
            firstName: child.firstName,
            lastName: child.lastName,
            birthday: child.birthday,
            grade: child.grade || '',
            role: child.role,
            school: child.school || ''
          };
          
          this.ngZone.run(() => {
            this.children.push(childToAdd);
            console.log('Child added to local array:', childToAdd);
            console.log('Updated local children list:', this.children);
            
            this.searchError = '';
            this.errorMessage = '';


            
            this.foundChild = null;
            this.childSearch = { lastName: '', firstName: '', birthday: '' };
          });
        } else {
          console.log('Child was already in the list!');
          this.searchError = 'This child is already linked to you.';
        }
      } else {
        throw new Error('User data not found');
      }    } catch (error) {
      console.error('Error adding child:', error);
      this.errorMessage = this.getTranslation('addChildError');
    } finally {
      this.loading = false;
    }
  }

  startEdit(child: Student) {
    this.editChild = { ...child };
  }

  cancelEdit() {
    this.editChild = null;
  }

  async saveChildEdit() {
    if (!this.editChild) return;
    try {
      const childRef = ref(this.db, `users/${this.editChild.uid}`);
      await update(childRef, {
        firstName: this.editChild.firstName,
        lastName: this.editChild.lastName,
        birthday: this.editChild.birthday,
        schoolGrade: this.editChild.grade,
      });
      const idx = this.children.findIndex(c => c.uid === this.editChild!.uid);
      if (idx !== -1) {
        this.children[idx] = { ...this.editChild };
      }
      this.editChild = null;
    } catch (error) {
      this.errorMessage = this.getTranslation('updateError');
    }
  }

  async loadTeachers() {
    const snapshot = await get(ref(this.db, 'users'));
    if (snapshot.exists()) {
      const users = snapshot.val();
      this.teachers = {};
      Object.entries(users).forEach(([uid, user]: [string, any]) => {
        if (user.role === 'Teacher') {
          this.teachers[uid] = user;
        }
      });
    }
  }
  getTeacherName(teacherId: string): string {
    const teacher = this.teachers[teacherId];
    return teacher ? `${teacher.firstName} ${teacher.lastName}` : this.getTranslation('noTeacher');
  }
}